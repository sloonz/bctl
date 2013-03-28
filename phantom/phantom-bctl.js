const default_port = 32000;
const user_agent = 'Mozilla/5.0 (Unknown; Linux i686) AppleWebKit/537.17 (KHTML, like Gecko) Chrome/24.0.1312.60 Safari/537.17';

var pages = [];

function doExecute(page, code) {
	return page.evaluate(function(code) {
		var __res = {
			"result": "ok",
			"output": null,
			"value": null
		};

		var print = function(txt) {
			if(__res.output)
				__res.output += txt.toString();
			else
				__res.output = txt.toString();
		};

		var println = function(txt) {
				print(txt.toString() + "\n");
		};

		var log = function(txt) {
			console.log(txt);
		};

		try {
		       var fake_window = Object.create(window);
		       fake_window.getComputedStyle = function() { // Fix an issue with jQuery
				return window.getComputedStyle.apply(window, arguments);
		       };
			__res.value = eval("(function(window){"+code+";})").call(fake_window, fake_window);
		} catch(e) {
			__res = {
				"result": "error",
				"name": e.name,
				"message": e.message,
				"fileName": e.fileName,
				"lineNumber": e.lineNumber,
				"stack": e.stack,
				"output": __res.output
			}
		}

		return __res;
	}, code);
}

var port = default_port;
require("system").args.forEach(function(arg) {
       var m = arg.match(/^--port=(\d+)$/);
       if(m)
	      port = parseInt(m[1]);
});

require("webserver").create().listen(port, function(request, response) {
	if(request.url == "/list") {
		var res = [];
		for(var i = 0; i < pages.length; i++) {
			res.push({
				"id": i.toString(),
				"url": pages[i].url,
				"title": pages[i].title,
				"state": pages[i].evaluate(function() { return document.readyState; }),
				"active": (i==0)
			});
		}

		response.write(JSON.stringify(res));
		response.close();
		return;
	}

	var m=request.url.match(/^\/execute\/(\d+)$/);
       if(m) {
	       var id = parseInt(m[1]);
	       if(pages[id]) {
		       res = doExecute(pages[id], request.postRaw);
		       if(res.result == "error")
			      response.statusCode = 400;
		       response.write(JSON.stringify(res));
		       response.close();
		       return;
	       }
	}

	response.statusCode = 404;
	response.write('');
	response.close();
});

require("system").args.forEach(function(arg, i) {
	if(arg.match(/^https?:/)) {
		var page = require('webpage').create();

		page.settings.userAgent = user_agent;
		page.onAlert = function(msg) {
			console.log("ALERT: " + msg);
		};
		page.onConsoleMessage = function(msg) {
			console.log(msg);
		};

		pages.push(page);
		page.open(arg);
	}
});
