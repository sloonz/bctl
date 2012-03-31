(function() {
  var BCTLClient, BCTLInstance, _base;

  BCTLClient = (function() {

    function BCTLClient(sock, instance) {
      this.sock = sock;
      this.instance = instance;
      this.utf8conv = Cc["@mozilla.org/intl/utf8converterservice;1"].getService(Ci.nsIUTF8ConverterService);
      this.output = this.sock.openOutputStream(Ci.nsITransport.OPEN_BLOCKING, 0, 0);
      this.utf8out = Cc["@mozilla.org/intl/converter-output-stream;1"].createInstance(Ci.nsIConverterOutputStream);
      this.utf8out.init(this.output, "UTF-8", 0, "?".charCodeAt(0));
      this.input = this.sock.openInputStream(0, 0, 0).QueryInterface(Ci.nsIAsyncInputStream);
      this.sinput = Cc["@mozilla.org/scriptableinputstream;1"].createInstance(Ci.nsIScriptableInputStream);
      this.sinput.init(this.input);
      this.input.asyncWait(this, 0, 0, Cc["@mozilla.org/thread-manager;1"].getService().mainThread);
    }

    BCTLClient.prototype.onInputStreamReady = function(input) {
      var code, doc, func, idx, inst, line, match, res, sb, size, tab, _i, _len, _ref;
      try {
        this.input.available();
      } catch (error) {
        this.close();
        return;
      }
      line = this.readLine();
      if (/^EVAL (\d+) (\d+)$/.test(line)) {
        match = /^EVAL (\d+) (\d+)$/.exec(line);
        size = parseInt(match[1]);
        inst = parseInt(match[2]);
        code = this.read(size);
        doc = gBrowser.getBrowserAtIndex(inst).contentDocument;
        sb = new Cu.Sandbox(doc.nodePrincipal, {
          sandboxPrototype: doc.defaultView
        });
        _ref = ["print", "println", "read", "readLine", "close", "log"];
        for (_i = 0, _len = _ref.length; _i < _len; _i++) {
          func = _ref[_i];
          sb.importFunction(this[func].bind(this), func);
        }
        try {
          Cu.evalInSandbox(code, sb);
        } catch (error) {
          userChrome.log("Error in script: " + error, "bctl");
        }
      }
      if (line === "LIST") {
        res = [];
        idx = 0;
        while (idx < gBrowser.tabs.length) {
          tab = gBrowser.tabs[idx];
          if (tab === gBrowser.selectedTab) this.print("* ");
          this.println(idx.toString() + " " + gBrowser.getBrowserForTab(tab).contentDocument.location + " " + tab.label);
          idx++;
        }
        this.println("");
      }
      if (line === "CLOSE") {
        this.close();
      } else {
        this.input.asyncWait(this, 0, 0, Cc["@mozilla.org/thread-manager;1"].getService().mainThread);
      }
    };

    BCTLClient.prototype.log = function(s) {
      userChrome.log(s);
    };

    BCTLClient.prototype.close = function() {
      this.input.closeWithStatus(0);
      this.sinput.close();
      this.output.closeWithStatus(0);
      this.utf8out.close();
      this.sock.close(0);
    };

    BCTLClient.prototype.readLine = function() {
      var c, l;
      l = "";
      while (true) {
        c = this.sinput.read(1);
        if (c === "" || c === "\n") {
          return this.utf8conv.convertStringToUTF8(l, "UTF-8", true);
        }
        l += c;
      }
    };

    BCTLClient.prototype.read = function(size) {
      var chunk, data, n;
      data = "";
      n = 1;
      while (size > 0 && n > 0) {
        chunk = this.sinput.read(size);
        size -= chunk.length;
        data += chunk;
      }
      return this.utf8conv.convertStringToUTF8(data, "UTF-8", true);
    };

    BCTLClient.prototype.print = function(s) {
      s = s.toString();
      return this.utf8out.writeString(s);
    };

    BCTLClient.prototype.println = function(s) {
      this.print(s);
      return this.print("\n");
    };

    return BCTLClient;

  })();

  BCTLInstance = (function() {

    function BCTLInstance(port, window) {
      this.window = window;
      this.sock = Cc["@mozilla.org/network/server-socket;1"].createInstance(Ci.nsIServerSocket);
      this.sock.init(port, true, -1);
      this.sock.asyncListen(this);
    }

    BCTLInstance.prototype.onSocketAccepted = function(serverSocket, clientSocket) {
      new BCTLClient(clientSocket, this);
    };

    return BCTLInstance;

  })();

  if (typeof com === "undefined" || com === null) com = {};

  if (com.github == null) com.github = {};

  if ((_base = com.github).bctl == null) {
    _base.bctl = new BCTLInstance(12345, this);
  }

}).call(this);
