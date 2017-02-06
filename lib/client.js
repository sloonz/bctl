const path = require('path');
const os = require('os');
const fs = require('fs');
const net = require('net');
const process = require('process');

const debug = require('debug')('bctl:main');

const nativeHost = require('./native-host');
const NativeMessagingSocket = require('./native-protocol');
const { compareObjects } = require('./utils');

function doList(tabs) {
    tabs.sort((a, b) => compareObjects(a, b, ['browser', 'index', 'id']));
    for(let tab of tabs) {
        let tabDesc = `${tab.browser}/${tab.id}: (${tab.url}) ${tab.title}`;
        if(tab.active) {
            tabDesc = `[${tabDesc}]`;
        }
        process.stdout.write(`${tabDesc}\n`);
    }
    return Promise.resolve();
}

function doExecute(tabs, opts, page, args) {
    let requestedTab = null;

    // Find requested tab

    for(let tab of tabs) {
        if(page == '.' && tab.active) {
            requestedTab = tab;
            break;
        } else if(`${tab.id}` == page) {
            requestedTab = tab;
            break;
        } else if(tab.title.toLowerCase().includes(page.toLowerCase()) || tab.url.toLowerCase().includes(page.toLowerCase())) {
            if(!requestedTab) {
                requestedTab = tab;
                if(tab.active) {
                    break;
                }
            }
        }
    }

    debug(`Requested tab: ${requestedTab.id} (${requestedTab.url})`);

    // Build code

    let codeParts = [];
    for(let f of (opts.file || [])) {
        codeParts.push(fs.readFileSync(f).toString());
    }
    for(let e of (opts.execute || [])) {
        codeParts.push(e);
    }
    let code = codeParts.join(';');

    debug(`Executing code: ${code}`);

    // Execute code and wait for 'result' message, displaying 'response' messages

    requestedTab.socket.writeMessage({ type: 'execute', tab: requestedTab.id, code, args });

    const processReply = message => {
        if(message.type == 'result' || message.type == 'output') {
            if(message.data !== undefined) {
                if(typeof message.data == 'string') {
                    process.stdout.write(message.data);
                    if(message.type == 'result' && !message.data.endsWith('\n')) {
                        process.stdout.write('\n');
                    }
                } else {
                    process.stdout.write(JSON.stringify(message.data) + '\n');
                }
            }
        }

        if(message.type == 'result') {
            if(message.error) {
                process.stderr.write(message.error + '\n');
                if(message.stack) {
                    process.stderr.write(message.stack);
                }
                return Promise.resolve(1);
            } else {
                return Promise.resolve(0);
            }
        } else {
            return requestedTab.socket.readMessage().then(processReply);
        }
    };

    return requestedTab.socket.readMessage().then(processReply);
}

module.exports = {
    main() {
        // Parse arguments

        const argv = require('yargs/yargs')(process.argv.slice(2))
        .usage('Usage: $0 [options] [page [args...]]')
        .help('h').alias('h', 'help')
        .option('list', {
            alias: 'l',
            nargs: 0,
            describe: 'List available pages'
        })
        .option('execute', {
            alias: 'e',
            type: 'array',
            nargs: 1,
            describe: 'Execute given javascript argument'
        })
        .option('file', {
            alias: 'f',
            type: 'array',
            nargs: 1,
            describe: 'File to execute (- is for STDIN)'
        })
        .strict()
        .argv;

        let [page, ...args] = argv._;

        args = args.map(arg => {
            try {
                return JSON.parse(arg);
            } catch(e) {
                return arg;
            }
        });

        page = page || '.';

        // Get all tabs

        Promise.all(fs.readdirSync(nativeHost.runtimeDir).map(browser => {
            let socket = new NativeMessagingSocket();
            return socket.connect(path.join(nativeHost.runtimeDir, browser)).
                then(() => [browser, socket]);
        }))
        .then(result => {
            return Promise.all(result.map(([browser, socket]) => {
                socket.writeMessage({ type: 'get-tabs' });
                return socket.readMessage().then(message => [browser, socket, message]);
            }));
        })
        .then(result => {
            let tabs = [];
            for(let [browser, socket, message] of result) {
                for(let tab of message.tabs) {
                    tab.browser = browser;
                    tab.socket = socket;
                    tabs.push(tab);
                }
            }
            return tabs;
        })

        // Execute main command (either --list or execute script)

        .then(tabs => {
            let sockets = tabs.map(t => t.socket);
            if(argv.list) {
                return doList(tabs).then(() => [sockets]);
            } else {
                return doExecute(tabs, argv, page, args).then(rc => [sockets, rc]);
            }
        })

        // Close sockets and exit

        .then(([sockets, rc]) => {
            sockets.forEach(s => s.end());
            process.exit(rc || 0);
        })

        // Handle errors

        .catch(e => {
            console.log(e.toString());
            debug(e);
            process.exit(1);
        });
    }
};
