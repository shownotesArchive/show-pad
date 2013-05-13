#!/bin/sh

npm install .

cd static

mkdir js
cd js
wget "https://raw.github.com/mattsnider/jquery-plugin-query-parser/master/jquery-queryParser.min.js" -O jquery-queryParser.min.js
wget "http://www.appelsiini.net/download/jquery.jeditable.mini.js" -O jquery.jeditable.mini.js
wget "https://raw.github.com/ether/etherpad-lite-jquery-plugin/master/js/etherpad.js" -O etherpad.js
cd ..

mkdir css
cd css
cd ..

mkdir pwp
cd pwp
wget https://github.com/podlove/podlove-web-player/archive/master.zip
unzip master.zip
rm master.zip
cd ..
