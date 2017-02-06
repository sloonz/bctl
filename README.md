# Presentation

There is some attempts (like Uzbl) to bring Unix philosophy to web
browsers. However, they focus on /configuration/, not /data/. You can use
small programs, scripts, pipes and other funny things to manage cookies,
bookmarks, actions, and so on. But the data managed by the browser —
the webpage — is still unreachable to the common Unix toolkit (pipes,
grep, shell scripts, and so on). bctl is an attempt to fix that.

`bctl` is a small command-line tool which try to communicate with a
webpage hosted by your browser. For example, let’s say you want to
sort alphabetically all slashdot headlines :

    bctl -e '$("h2 .story-title>a").each((_,t)=>println($(t).text()))' slashdot | sort

You can pass arguments to your scripts, too :

    bctl -e 'println("Hello, " + args[0])' . world

JSON-formatted arguments are supported :

    bctl -e 'println("Hello, " + args[0]["name"])' . '{"name": "world"}'

# Installation

`bctl` requires `nodejs`.

1. Build `bctl` with `npm install && npm run build`

2. Copy `build/bctl` somewhere in your `$PATH`

3. Register the native app by running `bctl` without any argument

4. Intall your browser extension

5. Test your installation :

    bctl -e 'println("Hello, world !")'

(Note: you must do step 2 before step 3. If you have installed the
browser extension before step 2, restart your browser after step 2)

# API

Scripts will have acces to the DOM API, and a small subset of the
WebExtension API.
See [this page](https://developer.mozilla.org/en-US/Add-ons/WebExtensions/Content_scripts#Content_script_environment)
for more information.

`bctl` also exposes those three helper functions :

* `log(msg)`, which prints a message to stderr
* `print(msg)`, which prints a message to stdout
* `println(msg)`, equivalent to `print(msg + "\n")`

# Changes from 1.0

* Dropped PhantomJS support (for now at least. Open an issue if it is
important for you !)

* Dropped CoffeScript support. ES2015 is natively supported by most
browsers now, and brings most of the eye-candiness of CoffeeScript.

* Use Unix sockets instead of TCP sockets. You no longer need to specify
the port on the command-line, and all browsers are accessed simultaneously.

* Added Chrome support.
