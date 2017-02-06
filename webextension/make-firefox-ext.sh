#!/bin/sh

set -x

curl https://code.jquery.com/jquery-3.1.1.min.js > jquery.min.js &&
	printf "" > browser-polyfill.min.js &&
	zip ../build/firefox-ext.zip *.js manifest.json
