#!/bin/sh

npm install .

cd static

mkdir js
cd js
wget "https://raw.github.com/mattsnider/jquery-plugin-query-parser/master/jquery-queryParser.min.js" -O jquery-queryParser.min.js
wget "http://www.appelsiini.net/download/jquery.jeditable.mini.js" -O jquery.jeditable.mini.js
wget "https://jquery-datatables-editable.googlecode.com/svn/trunk/media/js/jquery.dataTables.editable.js" -O jquery.dataTables.editable.js
wget "https://raw.github.com/ether/etherpad-lite-jquery-plugin/master/js/etherpad.js" -O etherpad.js
wget "https://raw.github.com/silviomoreto/bootstrap-select/master/bootstrap-select.min.js" -O bootstrap-select.min.js
cd ..

mkdir css
cd css
wget "https://raw.github.com/silviomoreto/bootstrap-select/master/bootstrap-select.min.css" -O bootstrap-select.min.css
cd ..
