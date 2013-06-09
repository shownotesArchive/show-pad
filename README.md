ShowPad
=======

A realtime web application written in node.js whose aim it is to replace
the current etherpad-solution and provide a perfect enviroment to write
shownotes for various podcasts. See also: http://shownot.es/

The favicon is the [shownotes-icon](https://github.com/shownotes/shownot.es/blob/master/favicon.ico).


Setup
-----

### General
To start ShowPad just run the supplied `run.sh`, which will call `setup.sh` if needed.
`setup.sh` will install all dependencies and download static third party css or js files.
A redis-server which is configured to use unix-sockets is needed, set `unixsocket redis.sock`
in your redis-config. The minimum redis-version is 2.4 because of a change in the [`sadd`](http://redis.io/commands/sadd)-command.

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

You should als set `requireSession` to `true` and `editOnly` to `true` in your etherpad-lite `settings.json` as
this is required for the authentication to work properly.

**ShowPad and etherpad-lite have to be accessible using the same domain since ShowPad needs to set a cookie which is used by etherpad-lite!**

### E-Mail
ShowPad needs to send emails for the account-activation, you can choose between `sendmail`, which just tries to use
the `sendmail`-command to send emails or `smtp` which connects to a "real" mailserver to send emails.
See [nodemailer](http://www.nodemailer.com/) for more details and options.

The mail-config inside `config.json` looks like this:
```javascript
"mail":
{
  "type": "smtp", // or 'sendmail'
  "from": "admin@google.com", // the email-address to use as sender
  "settings": // not needed for 'sendmail'
  {
    host: "smtp.gmail.com",
    secureConnection: true,
    port: 465,
    auth:
    {
      user: "user@gmail.com",
      pass: "userpass"
    }
  }
}
```

### Contributing
The entry point of showpad is [`server.js`](https://github.com/shownotes/show-pad/blob/master/src/server.js).
Search for `console.info("Let's go")` to find the first few lines of meaningful code that are executed.
ShowPad then goes on and loads the [doctypes](https://github.com/shownotes/show-pad/blob/master/doc/doctypes.md),
databases (missing doc, #36), [API](https://github.com/shownotes/show-pad/blob/master/doc/api.md) and what not.
In case you're having trouble with the templating take a look at [`templating.md`](https://github.com/shownotes/show-pad/blob/master/doc/templating.md).


Technologies used
-----------------

* Serverside: [node.js](http://nodejs.org/)
  * http/routing: [express.js](http://expressjs.com/)
  * persistant sessions: [connect-redis](https://github.com/visionmedia/connect-redis)
  * [async.js](https://github.com/caolan/async), because it's awesome!
  * emails: [nodemailer](http://www.nodemailer.com/)
  * rate limiting: [limiter](https://github.com/jhurliman/node-rate-limiter)
  * caching: [memory-cache](https://github.com/ptarjan/node-cache)
  * templaing: [ejs](http://embeddedjs.com/) + [ejs-locals](https://github.com/RandomEtc/ejs-locals) (blocks)
  * database: [redis](http://redis.io/) + [node_redis](https://github.com/mranney/node_redis)
  * logging: [log4js-node](https://github.com/nomiddlename/log4js-node)
  * localization: [i18n-node](https://github.com/mashpie/i18n-node)
  * [amqp](https://github.com/postwait/node-amqp)
  * configuration: [nconf](https://github.com/flatiron/nconf)
  * cookies: [cookie](https://github.com/shtylman/node-cookie) + [cookie-signature](https://github.com/visionmedia/node-cookie-signature)
  * validating forms: [express-validator](https://github.com/ctavan/express-validator)
  * captchas: [node-recaptcha](https://github.com/mirhampt/node-recaptcha)
  * and many others! see [`package.json`](https://github.com/shownotes/show-pad/blob/master/package.json)
* Clientside (License)
  * [jQuery](http://jquery.com/) (MIT)
  * [jQuery-queryParser](https://github.com/mattsnider/jquery-plugin-query-parser) (MIT)
  * [twitter bootstrap](http://twitter.github.com/bootstrap/) (Apache v2.0)
  * [noisetexturegenerator](http://noisetexturegenerator.com/)
  * [datatables](http://datatables.net/) (BSD 3-clause)
  * [recaptcha](http://www.google.com/recaptcha) (http://www.google.com/recaptcha/terms)
  * [jquery-datatables-editable](https://code.google.com/p/jquery-datatables-editable/) (BSD 3-clause)
  * [jEditable](http://www.appelsiini.net/projects/jeditable) (MIT)
  * [tinyOSF.js](https://github.com/shownotes/tinyOSF.js) (MIT)

[![flattr](http://api.flattr.com/button/flattr-badge-large.png)](http://flattr.com/thing/1225851/ShowPad)
