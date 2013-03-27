'use strict';

const { classes: Cc, Constructor: CC, interfaces: Ci, utils: Cu, results: Cr, manager: Cm } = Components;
const default_port = 32000;

var bctl = {
	server: null,
	tabCount: 0,
	tabs: {},
	shutdownCallbacks: [],

	replyError: function(response, exc) {
		response.setStatusLine(null, 500, "Internal Server Error");
		response.write(exc);
		response.write("\n\n");
		response.write(exc.stack);
	},

	doList: function(request, response) {
		try {
			var res = [];
			for(var i in this.tabs) {
				var mainBrowser = this.tabs[i][0];
				var browser = this.tabs[i][1];
				var tab = null;
				var isActive = false;

				for(var j = 0; j < mainBrowser.browsers.length; j++) {
					if(mainBrowser.getBrowserAtIndex(j) === browser) {
						tab = mainBrowser.tabs[j];
						continue;
					}
				}

				if(tab === mainBrowser.selectedTab)
					isActive = true;

				res.push({
					"id": i,
					"url": browser.currentURI.spec,
					"title": (tab ? tab.label : null),
					"status": (browser.contentDocument ? browser.contentDocument.readyState : null),
					"active": isActive
				});
			}
			response.writeString(JSON.stringify(res));
		} catch(e) {
			this.replyError(response, e);
		}
	},

	doExecute: function(request, response) {
		try {
			/* Check that session exists and is ready */
			var id = request.path.replace(/^\/execute\//, "");
			if(!(id in this.tabs)) {
				response.setStatusLine(null, 404, "Invalid Session");
				return;
			}

			var b = this.tabs[id][1];
			if(!b.contentDocument || !b.contentDocument.defaultView) {
				response.setStatusLine(null, 503, "Session Not Ready");
				return;
			}

			/* Read input script */
			var conv = Cc["@mozilla.org/intl/scriptableunicodeconverter"].createInstance(Ci.nsIScriptableUnicodeConverter);
			var is = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream);
			var code = "";

			is.init(request.bodyInputStream);
			conv.charset = "UTF-8";

			do {
				var data = is.read(1024);
				code += data;
			} while(data);
			code = conv.ConvertToUnicode(code);

			/* Create sandboxed environnement */
			var sb = new Cu.Sandbox(b.contentDocument.nodePrincipal, {sandboxPrototype: b.contentDocument.defaultView});
			var res = {
				"result": "ok",
				"output": null,
				"value": null,
				"exc": null
			};

			sb.importFunction(function(text) {
				if(res.output === null)
					res.output = text.toString();
				else
					res.output += text.toString();
			}, "print");

			sb.importFunction(function(text) {
				if(res.output === null)
					res.output = text.toString() + "\n";
				else
					res.output += text.toString() + "\n";
			}, "println");

			sb.importFunction(function(text) {
				Cc["@mozilla.org/consoleservice;1"].getService(Ci.nsIConsoleService).
					logStringMessage((new Date()).toLocaleFormat("%Y-%m-%d %H:%M:%S") + "  bctl: " + text);
			}, "log");

			sb.importFunction(function(exc){res.exc=exc}, "_setException");

			/* Run script */
			res.value = Cu.evalInSandbox("(function(){try{"+code+"}catch(e){_setException(e)}})();", sb);
			if(res.exc === null) {
				delete res["exc"];
			} else {
				response.setStatusLine(null, 400, "Script Raised Exception");
				res = {
					"result": "error",
					"name": res.exc.name,
					"message": res.exc.message,
					"fileName": res.exc.fileName,
					"lineNumber": res.exc.lineNumber,
					"stack": res.exc.stack,
					"output": res.output
				};
			}
			response.writeString(JSON.stringify(res));

		} catch(e) {
			this.replyError(response, e);
		}
	},

	observe: function(subject, topic, data) {
		subject.addEventListener("load", this, true);
		this.shutdownCallbacks.push(function() {
			subject.removeEventListener("load", this, true);
		});
	},

	handleEvent: function(event) {
		switch(event.type) {
		case "load":
			var document = event.originalTarget;
			if(document.defaultView.gBrowser) {
				this.registerBrowser(document.defaultView.gBrowser);
			}
			break;
		case "TabOpen":
			var mainBrowser = event.target.ownerDocument.defaultView.gBrowser;
			this.tabs[this.tabCount++] = [mainBrowser, mainBrowser.getBrowserForTab(event.target)];
			break;
		case "TabClose":
			var b = event.target.ownerDocument.defaultView.gBrowser.getBrowserForTab(event.target);
			for(var i in this.tabs) {
				if(this.tabs[i][1] === b) {
					delete this.tabs[i];
				}
			}
			printTabList();
			break;
		}
	},

	registerBrowser: function(browser) {
		for(var i = 0; i < browser.browsers.length; i++) {
			this.tabs[this.tabCount++] = [browser, browser.getBrowserAtIndex(i)];
		}

		browser.tabContainer.addEventListener("TabOpen", this, false);
		this.shutdownCallbacks.push(function() {
			browser.tabContainer.removeEventListener("TabOpen", this, false);
		});

		browser.tabContainer.addEventListener("TabClose", this, false);
		this.shutdownCallbacks.push(function() {
			browser.tabContainer.removeEventListener("TabClose", this, false);
		});
	}
};

function startup(data, reason) {
	/* Register event for new windows */
	var os = Cc["@mozilla.org/observer-service;1"].getService(Ci.nsIObserverService);
	os.addObserver(bctl, "domwindowopened", false);
	bctl.shutdownCallbacks.push(function() {
		os.removeObserver(bctl, "domwindowopened");
	});

	/* Load web server */
	var loader = Cc["@mozilla.org/moz/jssubscript-loader;1"].getService(Ci.mozIJSSubScriptLoader);
	var http = {};
	loader.loadSubScript("chrome://bctl/content/httpd.js", http, "UTF-8");

	/* Start web server */
	var port;
	try {
		port = Cc["@mozilla.org/preferences-service;1"].getService(Ci.nsIPrefService).
			getBranch("extensions.bctl.").getIntPref("port");
	} catch(e) {
		port = default_port;
	}
	bctl.server = new http.nsHttpServer();
	bctl.server.registerPathHandler('/list', bctl.doList.bind(bctl));
	bctl.server.registerPrefixHandler('/execute/', bctl.doExecute.bind(bctl));
	bctl.server.start(port);
	bctl.shutdownCallbacks.push(function() {
		bctl.server.stop();
	});
}

function shutdown(data, reason) {
	for(var i in bctl.shutdownCallbacks) {
		bctl.shutdownCallbacks[i]();
	}
}

function install(data, reason) {}
function uninstall(data, reason) {}
