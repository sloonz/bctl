# Presentation

Recently, attempts (like Uzbl) has been made to bring Unix philosophy to
web browsers. However, they focused on /configuration/, not /data/. You
could use small programs, scripts, pipes and other funny things to
manage cookies, bookmargs, actions, and so on. But the data managed by
the browser — the webpage — was still unreachable to the common Unix
toolkit (pipes, grep, shell scripts, and so on). bctl is an attempt to
fix that.

`bctl` is a small command-line tool which try to communicate with the
webpage. For example, let’s say you want to sort alphabetically all
slashdot headlines :

    bctl -e '$("h2.story a").each (_,s)->println($(s).text())' slashdot | sort

Careful readers will recognize jQuery constructs (`$`, selectors) and
CoffeeScript (`->` operator).

Pipes work the other way, too. Let’s say you want to scroll to “Most
discussed” on Slashdot. Of course, you can simply do this :

    bctl -e '$(document).scrollTop($("#mostdiscussed-title").offset().top)'

but let’s say that “mostdiscussed” comes from stdin (because it
comes from a script, for example). Then, you can do this :

    echo mostdiscussed | bctl -ne '$(document).scrollTop($("#"+readLine()+"-title").offset().top)'

(note the `-n` flag: this tells to `bctl` not to close the connection
immediatly after sending the script)

You can pass arguments to your scripts, too :

    bctl -e 'println("Hello, " + args[0])' . world

JSON-formatted arguments are supported :

    bctl -e 'println("Hello, " + args[0]["name"])' . '{"name": "world"}'

# Installation

First, install the two bctl dependencies :
[CoffeeScript](http://coffeescript.org/) and
[jQuery](http://jquery.com/). The `coffee` command must be in your
`$PATH`, and you must put the `jquery.min.js` file into `~/.cache`.

    wget http://code.jquery.com/jquery-1.7.2.min.js -O ~/.cache/jquery.min.js

`bctl` has 3 parts : the frontend (`bctl`), a daemon (`bctld`), and a
Firefox userChromeJS script.

To install the frontend, just copy `bctl` somewhere in your `$PATH`
(or modify your `$PATH`, that’s up to you).

To install the daemon, first install [Go](http://golang.org), then type
`go build` inside the `bctld/` directory. This will produce a `bctld`
executable, that you must run before any browser (you can put it in your
`.xsession` file, for example).

To install the Firefox script, first install the
[userChromeJS](http://userchromejs.mozdev.org/) extension. Then, compile
the `bctl-firefox.uc.coffee` file with `coffee`, copy it into your
`chrome/` folder, and instruct userChromeJS to load it :

    coffee -c bctl-firefox.uc.coffee
    cp bctl-firefox.uc.js ~/.mozilla/firefox/*/chrome
    echo 'userChrome.import("bctl-firefox.uc.js", "UChrm");' >> ~/.mozilla/firefox/*/chrome

Ensure that bctld is running, restart firefox, and test your installation :

    bctl -e 'println("Hello, world !")'

# API

Scripts will have acces to the normal DOM API, but not to the privileged API a firefox (much like GreaseMonkey). Instead, bctl will expose some functions :

* `readLine()`, which reads a line from stdin
* `read(n)`, which reads exactly n characters from stdin
* `log(msg)`, which prints a message in the console
* `print(msg)`, which prints a message to stdout
* `println(msg)`, equivalent to `print(msg + "\n")`
