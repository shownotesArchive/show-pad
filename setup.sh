#!/bin/sh

npm install .

cp node_modules/share/node_modules/browserchannel/dist/bcsocket.js static/js/bcsocket.js
cp -r node_modules/share/webclient/ static/webclient/

cd static/js
wget "https://raw.github.com/mattsnider/jquery-plugin-query-parser/master/jquery-queryParser.min.js" -O jquery-queryParser.min.js
