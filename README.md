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

`bctl` has 2 parts : the frontend (`bctl`) and a browser-specific backend
(only Firefox is supported right now)

To install the frontend, just copy `bctl` somewhere in your `$PATH`
(or modify your `$PATH`, that’s up to you).

To install the Firefox extension, just run the `makexpi` script and then
open it with firefox :

    ./makexpi
    firefox bctl.xpi

Restart firefox, and test your installation :

    bctl -e 'println("Hello, world !")'

# PhantomJS backend

There is also a PhantomJS backend located at
`phantomjs/phantomjs-bctl.js`.

    $ phantomjs phantomjs-bctl.js --port=32001 http &
    $ bctl -p 32001 -l
    [0: (http://whatsmyuseragent.com/) Whats My User Agent?]
    $ bctl -p 32001 -e 'println $("#body_lbUserAgent").text()'
    Mozilla/5.0 (Unknown; Linux i686) AppleWebKit/537.17 (KHTML, like Gecko) Chrome/24.0.1312.60 Safari/537.17
    $ killall phantomjs

You can omit `--port=` and `-p` to use default port, but it may be used
by firefox backend.

# API

Scripts will have acces to the normal DOM API, but not to the privileged API a firefox (much like GreaseMonkey). Instead, bctl will expose some functions :

* `log(msg)`, which prints a message in the console
* `print(msg)`, which prints a message to stdout
* `println(msg)`, equivalent to `print(msg + "\n")`
