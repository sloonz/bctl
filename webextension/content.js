function executeScript(code, args, print, println) {
	// wrap it around function() so the user can use return
	return eval('(function(){'+code+'})()');
}

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
	const sendClientReply = reply => browser.runtime.sendMessage({type: 'client-reply', client: message.clientId, reply});

	switch(message.type) {
		case 'execute':
			const print = arg => sendClientReply({ type: 'output', data: arg });
			const println = arg => sendClientReply({ type: 'output', data: `${arg}\n` });
			try {
				if(typeof(window.$) == 'undefined') {
					eval(message.jq);
				}
				let result = executeScript(message.code, message.args, print, println);
				sendClientReply({ type: 'result', data: result });
			} catch(e) {
				sendClientReply({ type: 'result', error: (e.message || e.toString()), stack: e.stack });
			}
			break;
	}

	return {};
});
