class BCTLConnection
	constructor: (@sock)->
		@utf8conv = Cc["@mozilla.org/intl/utf8converterservice;1"].getService(Ci.nsIUTF8ConverterService)

		@output = @sock.openOutputStream(Ci.nsITransport.OPEN_BLOCKING, 0, 0)
		@utf8out = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(Ci.nsIConverterOutputStream)
		@utf8out.init(@output, "UTF-8", 0, "?".charCodeAt(0))

		@input = @sock.openInputStream(0, 0, 0).QueryInterface(Ci.nsIAsyncInputStream)
		@sinput = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream)
		@sinput.init(@input)

		@input.asyncWait(this, 0, 0, Cc["@mozilla.org/thread-manager;1"].getService().mainThread)
	
	log: (s)->
		userChrome.log(s, "bctl")
		return
	
	close: ->
		@input.closeWithStatus(0)
		@sinput.close()
		@output.closeWithStatus(0)
		@utf8out.close()
		@sock.close(0)
		return
	
	readLine: ->
		l = ""
		loop
			c = @sinput.read(1)
			if c == "" or c == "\n"
				return @utf8conv.convertStringToUTF8(l, "UTF-8", true)
			l += c
	
	read: (size)->
		data = ""
		n = 1
		while size > 0 and n > 0
			chunk = @sinput.read(size)
			size -= chunk.length
			data += chunk
		return @utf8conv.convertStringToUTF8(data, "UTF-8", true)

	print: (s)->
		s = s.toString()
		@utf8out.writeString(s)
	
	println: (s)->
		this.print(s.toString() + "\n")

class BCTLMaster extends BCTLConnection
	constructor: (@host, @port)->
		super(this.connect())
		this.println("REGISTER firefox")
	
	connect: ->
		Cc["@mozilla.org/network/socket-transport-service;1"].
			getService(Ci.nsISocketTransportService).
			createTransport(null, 0, @host, @port, null)
	
	onInputStreamReady: (input)->
		try
			@input.available()
		catch error
			this.close()
			return

		line = this.readLine()
		if line == "PING"
			this.println(line)
		else if /^CONN /.test(line)
			match = /^CONN (.+)/.exec(line)
			cid = match[1]
			slave = new BCTLSlave(this.connect())
			slave.println("CONN " + cid)

		@input.asyncWait(this, 0, 0, Cc["@mozilla.org/thread-manager;1"].getService().mainThread)
	
	finalize: ->
		this.println("CLOSE")
		this.close()

class BCTLSlave extends BCTLConnection
	onInputStreamReady: (input)->
		try
			@input.available()
		catch error
			this.close()
			return

		line = this.readLine()
		if /^EVAL (\d+) (\d+)$/.test(line)
			match = /^EVAL (\d+) (\d+)$/.exec(line)
			size = parseInt(match[1])
			inst = parseInt(match[2])
			code = this.read(size)

			doc = gBrowser.getBrowserAtIndex(inst).contentDocument
			sb = new Cu.Sandbox(doc.nodePrincipal, {sandboxPrototype: doc.defaultView})
			for func in ["print", "println", "read", "readLine", "close", "log"]
				sb.importFunction(this[func].bind(this), func)
			try
				Cu.evalInSandbox(code, sb)
			catch error
				this.log("Error in script: " + error)
		if line == "LIST"
			res = []
			idx = 0
			while idx < gBrowser.tabs.length
				tab = gBrowser.tabs[idx]
				if tab == gBrowser.selectedTab
					this.print("* ")
				this.println(idx.toString() + " " + gBrowser.getBrowserForTab(tab).contentDocument.location + " " + tab.label)
				idx++
			this.println("")
		
		if line == "CLOSE"
			this.close()
		else
			@input.asyncWait(this, 0, 0, Cc["@mozilla.org/thread-manager;1"].getService().mainThread)
		return


if document.location.toString() == "chrome://browser/content/browser.xul"
	new BCTLMaster("127.0.0.1", 12346)
