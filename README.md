ShowPad
=======

A realtime web application written in node.js whose aim it is to replace
the current etherpad-solution and provide a perfect enviroment to write
shownotes for various podcasts. See also: http://shownot.es/

The favicon is a modified version of the [shownotes-icon](https://github.com/shownotes/shownot.es/blob/master/favicon.ico).


Setup
-----

### General
To start ShowPad just run the supplied `run.sh`, which will call `setup.sh` if needed.
`setup.sh` will install all dependencies and download static third party css or js files.
A redis-socket is needed to run ShowPad, its path can be set in `config.json`.

### etherpad-lite
ShowPad is able to support multiple document types, but at the moment there is only the etherpad-lite one.
Thus ShowPad needs a running and working etherpad-lite installation and the following values in your `config.json`:
```JSON
"etherpad":
{
  "host":"",
  "port":"",
  "apikey":""
}
```
* `host` is the URL where your etherpad-lite can be found, for example: `127.0.0.1` or `beta.etherpad.org`
* `port` the port on which your etherpad-lite listens, see your etherpad-lite `settings.json`
* `apikey` can be found in the `APIKEY.txt`-file of your etherpad-lite installation

**ShowPad and etherpad-lite have to be accessible using the same domain since ShowPad needs to set a cookie which is used by etherpad-lite!**


Technologies used
-----------------

* Serverside: [node.js](http://nodejs.org/)
  * http/routing: [express.js](http://expressjs.com/)
  * templaing: [ejs](http://embeddedjs.com/) + [ejs-locals](https://github.com/RandomEtc/ejs-locals) (blocks)
  * database: [redis](http://redis.io/) + [node_redis](https://github.com/mranney/node_redis)
  * logging: [log4js-node](https://github.com/nomiddlename/log4js-node)
  * localization: [i18n-node](https://github.com/mashpie/i18n-node)
  * configuration: [nconf](https://github.com/flatiron/nconf)
  * cookies: [cookie](https://github.com/shtylman/node-cookie) + [cookie-signature](https://github.com/visionmedia/node-cookie-signature)
  * validating forms: [express-validator](https://github.com/ctavan/express-validator)
  * and many others! see [`package.json`](https://github.com/shownotes/show-pad/blob/master/package.json)
* Clientside
  * [jQuery](http://jquery.com/)
  * [jQuery-queryParser](https://github.com/mattsnider/jquery-plugin-query-parser)
  * [twitter bootstrap](http://twitter.github.com/bootstrap/)
  * [noisetexturegenerator](http://noisetexturegenerator.com/)
  * [datatables](http://datatables.net/)
  * [jquery-datatables-editable](https://code.google.com/p/jquery-datatables-editable/) + [jEditable](http://www.appelsiini.net/projects/jeditable)

[![flattr](http://api.flattr.com/button/flattr-badge-large.png)](http://flattr.com/thing/1160045/)
