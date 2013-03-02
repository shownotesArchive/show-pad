ShowPad
=======

A realtime web application written in node.js whose aim it is to replace
the current etherpad-solution and provide a perfect enviroment to write
shownotes for various german podcasts. See also: http://shownot.es/

Technologies used
-----------------

* Serverside: [node.js](http://nodejs.org/)
  * http/routing: [express.js](http://expressjs.com/)
  * templaing: [ejs](http://embeddedjs.com/) + [ejs-locals](https://github.com/RandomEtc/ejs-locals) (blocks)
  * dattabase: [redis](http://redis.io/) + [node_redis](https://github.com/mranney/node_redis)
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

Last but not least, the syncing is done by [ShareJS](http://sharejs.org/).
