const fs = require('fs');
const path = require('path');
const process = require('process');
const os = require('os');
const net = require('net');
const crypto = require('crypto');

const debug = require('debug')('bctl:native-host');
const home = require('user-home');
const mkdirp = require('mkdirp');

const NativeMessagingStream = require('./native-protocol');

const xdgRuntimeDir = process.env['XDG_RUNTIME_DIR'] || path.join(os.tmpdir(), `.run-${os.userInfo().uid}`);
const runtimeDir = path.join(xdgRuntimeDir, 'bctl');

mkdirp(runtimeDir);

const baseManifest = {
    name: 'bctl',
    description: 'Interact with browser tabs from the command line',
    path: require.main.filename,
    type: 'stdio',
};

const firefoxManifest = Object.assign({}, baseManifest, {
    allowed_extensions: [
        'bctl@simon.lipp.name',
    ]
});

const chromeManifest = Object.assign({}, baseManifest, {
    allowed_origins: [
        'chrome-extension://hlambcpccponddpbleiacdjcoljdgabc/'
    ]
});

function getAppManifests() {
    // See:
    //  https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Native_messaging#App_manifest_location
    //  https://developer.chrome.com/extensions/nativeMessaging#native-messaging-host-location
    switch(process.platform) {
        case 'win32':
            throw new Exception('Windows is not supported');
            break;
        case 'darwin':
            return [
                [path.join(home, 'Library', 'Application Support', 'Mozilla', 'NativeMessagingHosts', 'bctl.json'), firefoxManifest],
                [path.join(home, 'Library', 'Application Support', 'Google', 'Chrome', 'NativeMessagingHosts', 'bctl.json'), chromeManifest],
                [path.join(home, 'Library', 'Application Support', 'Chromium', 'NativeMessagingHosts', 'bctl.json'), chromeManifest],
            ]
            break;
        default:
            // Defaults to unix-like: linux, *bsd...
            return [
                [path.join(home, '.mozilla', 'native-messaging-hosts', 'bctl.json'), firefoxManifest],
                [path.join(home, '.config', 'google-chrome', 'NativeMessagingHosts', 'bctl.json'), chromeManifest],
                [path.join(home, '.config', 'chromium', 'NativeMessagingHosts', 'bctl.json'), chromeManifest]
            ];
    }
}

function run() {
    debug('Running native host');

    let clients = {}
    let browserInputStream = new NativeMessagingStream(process.stdin);
    let browserOutputStream = new NativeMessagingStream(process.stdout);

    let socketPath;

    const clearSocket = socketPath => {
        if(socketPath && fs.existsSync(socketPath)) {
            fs.unlinkSync(socketPath);
        }
    };

    const exit = rc => {
        clearSocket(socketPath);
        process.exit(rc);
    };

    // clients <-> native host link

    let server = net.createServer(client => {
        let stream = new NativeMessagingStream(client);
        let bytes = crypto.randomBytes(256);
        let clientId = crypto.createHash('sha256').update(bytes).digest().hexSlice();
        clients[clientId] = stream;
        stream.onMessage(message => {
            browserOutputStream.writeMessage({ type: 'client-message', client: clientId, message });
        }, err => {
            debug(err);
        });
    });

    server.on('error', err => {
        debug(err);
        exit(1);
    });

    // browser <-> native host link

    browserInputStream.onMessage(message => {
        if(message !== null) {
            switch(message.type) {
                    case 'register':
                            socketPath = path.join(runtimeDir, message.ua);
                            debug(`Listening on ${socketPath}`);
                            clearSocket(socketPath);
                            server.listen({ path: socketPath });
                            break;
                    case 'client-reply':
                            if(clients[message.client]) {
                                clients[message.client].writeMessage(message.reply).
                                    catch(e => debug(e));
                            }
                            break;
                    default:
                            debug({unknownMessage: message});
                            break;
            }
        }
    }, err => {
        debug(err);
        exit(1);
    });

    process.stdin.on('close', () =>  {
        debug('stdin: close');
        exit(0);
    });
}

module.exports = {
    register() {
        for(let [manifestPath, manifest] of getAppManifests()) {
            debug(`Writing manifest to ${manifestPath}`);
            mkdirp.sync(path.dirname(manifestPath));
            fs.writeFileSync(manifestPath, JSON.stringify(manifest));
        }
    },

    isNativeHost() {
        const firstArgument = process.argv[2]; // 0 is node, 1 is script
        if(firstArgument) {
            if(firstArgument.startsWith('chrome-extension://') || getAppManifests().map(m=>m[0]).includes(firstArgument)) {
                return true;
            }
        }
        return false;
    },

    run, runtimeDir
};
