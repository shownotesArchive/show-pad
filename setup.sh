#!/bin/sh

npm install .

cd static

mkdir js
cd js
wget "https://raw.github.com/mattsnider/jquery-plugin-query-parser/master/jquery-queryParser.min.js" -O jquery-queryParser.min.js
wget "http://www.appelsiini.net/download/jquery.jeditable.mini.js" -O jquery.jeditable.mini.js
wget "https://raw.github.com/ether/etherpad-lite-jquery-plugin/master/js/etherpad.js" -O etherpad.js
wget "https://raw.github.com/podlove/podlove-web-player/master/podlove-web-player/podlove-web-player.js" -O podlove-web-player.js
wget "https://raw.github.com/podlove/mediaelement/master/build/mediaelement-and-player.min.js" -O mediaelement-and-player.min.js
cd ..

mkdir css
cd css
wget "https://raw.github.com/podlove/podlove-web-player/master/podlove-web-player/podlove-web-player.css" -O podlove-web-player.css
wget "https://raw.github.com/podlove/mediaelement/master/build/mediaelementplayer.min.css" -O mediaelementplayer.min.css
cd ..
