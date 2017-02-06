let port = browser.runtime.connectNative('bctl');

function handleClientMessage(clientId, message) {
	const sendClientReply = reply => port.postMessage({type: 'client-reply', client: clientId, reply});

	switch(message.type) {
		case 'get-tabs':
			browser.tabs.query({}).then(tabs => sendClientReply({ tabs }));
			break;
		case 'execute':
			fetch(browser.runtime.getURL('jquery.min.js')).
				then(resp => resp.text()).
				then(jq => {
					let contentMessage = Object.assign({}, message, { clientId, jq });
					return browser.tabs.sendMessage(message.tab, contentMessage);
				}).
				catch(e => {
					sendClientReply({ type: 'result', error: (e.message || e.toString()), stack: e.stack  })
				});
			break;
	}
}


port.onMessage.addListener(message => {
	// Messages from bctl (mostly messages from bctl command line tool)
	switch(message.type) {
		case 'client-message':
			handleClientMessage(message.client, message.message);
			break;
	}
});

port.onDisconnect.addListener(() => {
	// Most likely a bctl crash
	console.warn('Connection with bctl lost');
});

// Ask native host to register the socket so bctl command line tool can connect to us
if(browser.runtime.getBrowserInfo) {
	browser.runtime.getBrowserInfo().then(info => {
		port.postMessage({ type: 'register', ua: info.name });
	});
} else {
	// Assume chrome
	port.postMessage({ type: 'register', ua: 'Chrome' });
}

browser.runtime.onMessage.addListener(message => {
	// Messages from content scripts
	switch(message.type) {
		case 'client-reply':
			port.postMessage(message);
			break;
	}
});
