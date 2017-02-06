#!/bin/sh

set -x

build_browser_polyfill() {
	(
	cd ../build &&
		(test -d webextension-polyfill || git clone https://github.com/rpl/webextension-polyfill.git) &&
		cd webextension-polyfill &&
		git checkout fix/minify-es6-using-babili &&
		git pull &&
		npm install && npm run build
	)
}

curl https://code.jquery.com/jquery-3.1.1.min.js > jquery.min.js &&
	build_browser_polyfill &&
	cp ../build/webextension-polyfill/dist/browser-polyfill.min.js . &&
	zip ../build/chrome-ext.zip *.js manifest.json
