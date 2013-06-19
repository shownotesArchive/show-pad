var express   = require('express')
  , ejslocals = require('ejs-locals')
  , async     = require('async')
  , log4js    = require('log4js')
  , nconf     = require('nconf')
  , ejs       = require('ejs')
  , fs        = require('fs')
  , crypto    = require('crypto')
  , i18n      = require("i18n")
  , path      = require('path')
  , url       = require('url')
  , cache     = require('memory-cache')
  , Recaptcha = require('recaptcha').Recaptcha
  , amqp      = require('amqp')
  , nodemailer       = require('nodemailer')
  , RateLimiter      = require('limiter').RateLimiter
  , expressValidator = require('express-validator');

var db            = require('./db.js')
  , api           = require('./api.js')
  , documentTypes = require('./documenttypes.js')
  , hoerapi       = require('./hoersuppe/hoerapi.js')
  , xenimAmqp     = null
  , xenimAmqpExc  = null
  , app           = null
  , mailTransport = null
  , pageurl       = null
  , usernameChars = "[a-z0-9\._-]{1,30}"
  , usernameRegex = new RegExp("^" + usernameChars + "$", "i")
  , readonlyUsers = {}
  , readonlyUsersTimeouts = {}
  , sessionStore  = null
  , sessionSecret = null;

// rate limiters
var registerLimiters = {};
var createDocLimiters = {};

// exports
exports.documentTypes = documentTypes;
exports.nconf = nconf;
exports.db = db;
exports.log4js = log4js;
exports.pageurl = pageurl;

// startup
console.log("Let's go!");
log4js.configure('log4jsconfig.json', {});
log4js.replaceConsole();

var startupLogger = getLogger("startup");

async.series([
  initConfig,
  initMail,
  initDatabase,
  initDocTypes,
  initXenim,
  initApi,
  initi18n,
  initServer,
  startServer
],
function (err)
{
  if(err)
  {
    startupLogger.error(err);
    process.exit(1);
  }
  else
  {
    startupLogger.info("All done!");
  }

  startupLogger = null;
});

function initConfig(cb)
{
  startupLogger.info("Initiating configuration..");
  nconf.file({ file: 'config.json' });

  nconf.defaults({
      'http': {
          'ip': "0.0.0.0",
          'port': 8080
      }
  });

  pageurl = nconf.get("pageurl");
  // add '/' at the end of pageurl if needed
  if(pageurl.charAt(pageurl.length - 1) != '/')
    pageurl += '/';

  sessionSecret = nconf.get("sessionSecret");
  if(!sessionSecret || sessionSecret.length == 0)
  {
    cb("No session-secret given in config.json");
  }
  else
  {
    cb();
  }
}

function initMail(cb)
{
  var type = nconf.get('mail:type');
  startupLogger.info("Initiating mail (%s)..", type);
  mailTransport = nodemailer.createTransport(type, nconf.get('mail:options'));
  cb();
}

function initDatabase(cb)
{
  startupLogger.info("Initiating database..");
  db.init(nconf.get("database"), cb);
}

function initDocTypes(cb)
{
  startupLogger.info("Initiating doctypes..");
  documentTypes.init(exports, cb);
}

function initXenim(cb)
{
  if(nconf.get("xenim:disabled"))
  {
    startupLogger.info("Xenim disabled in config.");
    return cb();
  }

  startupLogger.info("Initiating xenim..");
  var failTimeout = setTimeout(xenimFail, 5000);
  var failed = false;

  xenimAmqp = amqp.createConnection(
    {
      host: 'messages.streams.xenim.de',
      vhost: "xsn_hls",
      login: "shownotes",
      password: nconf.get("xenim:password")
    }
  );

  xenimAmqp.on('ready',
    function ()
    {
      if(failed)
        return;

      startupLogger.debug("[Xenim] ready");
      xenimAmqp.exchange('shownotes',
        {
          passive: true
        },
        function (exc)
        {
          if(failed)
            return;

          startupLogger.debug("[Xenim] got exchange");
          clearTimeout(failTimeout);
          xenimAmqpExc = exc;
          cb();
        }
      );
    }
  );

  function xenimFail()
  {
    startupLogger.debug("[Xenim] timeout");
    failed = true;
    xenimAmqp = null;
    xenimAmqpExc = null;
    cb(); // continue without xenim
  }
}

function initApi(cb)
{
  startupLogger.info("Initiating api..");
  api.init(exports, cb);
}

function initi18n(cb)
{
  startupLogger.info("Initiating i18n..");
  i18n.configure({
      locales:['en', 'de'],
      cookie: 'locale',
      directory: path.resolve(__dirname + '/../locales'),
      extension: '.json',
      updateFiles: false
  });
  cb();
}

function initServer(cb)
{
  startupLogger.info("Initiating server..");

  app = express();
  app.engine('ejs', ejslocals);
  app.set('view engine', 'ejs');
  app.use(express.static(path.resolve(__dirname + '/../static')));
  app.use("/js/tinyosf/", express.static(path.resolve(__dirname + '/../node_modules/tinyosf')));
  app.use(express.cookieParser());

  startupLogger.debug("Initiating server-i18n..");
  app.use(i18n.init);

  // binding template helpers to request (Credits to https://github.com/enyo #12)
  app.use(function(req, res, next)
    {
      res.locals.__ = function() {
        return i18n.__.apply(req, arguments);
      };
      res.locals.__n = function() {
        return i18n.__n.apply(req, arguments);
      };
      // do not forget this, otherwise your app will hang
      next();
    });

  startupLogger.debug("Initiating server-forms..");
  app.use(express.bodyParser());
  app.use(expressValidator);

  if(nconf.get("trustproxy"))
  {
    app.enable('trust proxy');
    app.get('trust proxy');
  }

  startupLogger.debug("Initiating server-sessions..");
  // sessions
  sessionStore = db.prepareSessionStore(express, {});
  app.use(express.session({ secret: sessionSecret, store: sessionStore }));

  app.use(function(req, res, next)
    {
      res.locals.user = null;
      res.locals.page = req.path;
      if(!req.session.user)
      {
        next();
      }
      else
      {
        db.user.getUser(req.session.user, function (err, user)
          {
            if(!err)
              res.locals.user = user;
            next();
          });
      }
    });

  // http://stackoverflow.com/a/12497793
  app.use(function(req, res, next){
    if (req.is('text/*')) {
      req.text = '';
      req.setEncoding('utf8');
      req.on('data', function(chunk){ req.text += chunk });
      req.on('end', next);
    } else {
      next();
    }
  });

  startupLogger.debug("Initiating doctypes (express)..");
  documentTypes.onExpressInit(app);

  startupLogger.debug("Initiating server-routes..");
  // routes
  app.get('/', processIndex);
  app.post('/createDoc', processCreateDoc);
  app.get('/doc/:docname', function (req, res) { processDoc(req, res, "normal"); });
  app.get('/doc/:docname/readonly', function (req, res) { processDoc(req, res, "readonly"); });
  app.get('/doc/:docname/text', function (req, res) { processDoc(req, res, "text"); });
  app.get('/doc/:docname/snapshot', processDocSnapshot);

  // UI
  app.get('/login', function(req, res) { res.render('login'); });
  app.post('/login', processLogin);

  app.get('/pwreset', function (req, res) { res.render("pwreset-request"); });
  app.post('/pwreset', processPasswordResetRequest);

  app.get('/pwreset/:username(' + usernameChars + ')/:token', function (req, res) { res.render("pwreset"); });
  app.post('/pwreset/:username(' + usernameChars + ')/:token', processPasswordReset);

  app.get('/register', function(req, res)
    {
      var locals = { captcha: "" };

      if(registerLimiters[req.ip] && registerLimiters[req.ip].getTokensRemaining() < 1)
      {
        locals.captcha = getRecaptchaHTML();
      }

      res.render('register', locals);
    });
  app.post('/register', processRegister);

  app.get('/profile', processGetProfile);
  app.post('/profile', processProfile);

  app.get('/dashboard', function(req, res) { res.render('dashboard', { pageurl: pageurl, locale: req.locale }); });
  app.get('/dashboard/sendactivation/:username', sendDashboardUserActivation);

  app.get('/logout', processLogout);

  // email activation
  app.get('/activate/:username(' + usernameChars + ')/:token', processEmailActivation);

  // API
  app.get('/api/:version/:endpoint/:entity?', api.handleRequest);
  app.post('/api/:version/:endpoint/:entity?', api.handleRequest);
  app.put('/api/:version/:endpoint/:entity?', api.handleRequest);
  app.delete('/api/:version/:endpoint/:entity?', api.handleRequest);

  // public API
  app.get('/publicapi/docnames', processPublicDocnames);

  cb(null);
}

function startServer(cb)
{
  startupLogger.info("Starting http..");
  app.listen(nconf.get("http:port"), nconf.get("http:ip"), cb);
}

exports.getLogger = getLogger;
function getLogger(category)
{
  var logger = log4js.getLogger(category);
  var level = nconf.get("loglevel:" + category) || "DEBUG";
  logger.setLevel(level);
  return logger;
}

function processIndex (req, res)
{
  getClientPods(
    function (err, clientPods)
    {
      if(err)
      {
        console.error("Error while rendering index: " + err);
        clientPods = [];
      }

      res.render('index', { podcasts: clientPods });
    }
  );
}

function getClientPods (cb)
{
  var cacheName = "clientpods";
  var today = new Date();
  today.setHours(0,0,0,0);

  async.waterfall(
    [
      // check the cache
      function (cb)
      {
        var docs = cache.get(cacheName);

        if(docs)
          cb("cache", docs);
        else
          cb();
      },
      // get hoersuppe-live-podcasts
      function (cb)
      {
        var startDate = new Date();
        startDate.setDate(startDate.getDate()-1); // yesterday
        var endDate = new Date();
        endDate.setDate(endDate.getDate()+1); // yesterday
        hoerapi.getLive(null, startDate, endDate, cb);
      },
      // get podcast<->pad mapping
      function (podcasts, cb)
      {
        db.getHash("live2pad",
          function (err, liveToPad)
          {
            if(err)
            {
              cb(err);
            }
            else
            {
              cb(null, podcasts, liveToPad);
            }
          }
        );
      },
      // create a nice list for the client and render it
      function (podcasts, liveToPad, cb)
      {
        var clientPods = [];
        var maxRows = nconf.get("docsonindex");

        for (var i = 0; i < podcasts.length && clientPods.length < maxRows; i++)
        {
          var id = podcasts[i].id;
          var doc = {};
          var docName = liveToPad[id];

          podcasts[i].livedate = new Date(podcasts[i].livedate);

          if(docName)
          {
            doc.exists = true;
            doc.name = docName;
          }
          else
          {
            doc.exists = false;
          }

          var liveDate = new Date(+podcasts[i].livedate);
          liveDate.setHours(0,0,0,0);

          if(!doc.exists && today - liveDate > 0)
          {
            // podcast from yesterday and no created doc => skip it
            continue;
          }

          clientPods.push(
            {
              pod: podcasts[i],
              doc: doc
            }
          );
        }

        clientPods.sort( function (a, b) { return a.pod.livedate - b.pod.livedate; });
        cache.put(cacheName, clientPods, 60000);

        cb(null, clientPods);
      }
    ],
    function (err, result)
    {
      if(err == "cache")
      {
        err = null;
      }
      if(err)
      {
        console.error("Error while rendering index: " + err);
        result = [];
      }

      cb(err, result);
    }
  );
}

function processCreateDoc (req, res)
{
  var user = res.locals.user
    , body = req.body

  if(!user || !body.name || !body.id)
  {
    return reply("fail");
  }

  var username = user.username
    , episodeName = body.name.trim()
    , docname  = null
    , hoerid   = body.id
    , hoerPod  = null

  if(!(episodeName.match(/^[a-z0-9]+$/i)))
  {
    return reply("docname");
  }

  async.waterfall(
    [
      // check rate limiting
      function (cb)
      {
        if(user.hasRole("admin"))
        {
          return cb(null);
        }
        if(!createDocLimiters[username])
        {
          createDocLimiters[username] = new RateLimiter(2, 'hour', true);
        }

        createDocLimiters[username].removeTokens(1,
          function(err, remainingRequests)
          {
            cb(remainingRequests < 0 ? "rate" : null);
          }
        );
      },
      getClientPods,
      // find live-podcast
      function (clientPods, cb)
      {
        async.detect(clientPods,
          function (cpod, cb)
          {
            cb(cpod.pod.id == hoerid);
          },
          function (_hoerPod)
          {
            hoerPod = _hoerPod;
            if(hoerPod)
            {
              docname = hoerPod.pod.podcast + "-" + episodeName;
            }
            cb(hoerPod ? null : "fail-hoerpod");
          }
        );
      },
      // create doc
      function (cb)
      {
        // this function handels all errors in the parts (db, doctype, tpl) of the doc-creating
        function onError(part, err, cb, args)
        {
          if(err)
          {
            err = part + "-" + err;
          }
          cb.apply(this, [err].concat(args));
        }

        var doc;

        async.waterfall(
          [
            // create doc in db
            function (cb)
            {
              db.doc.createDoc(docname, "etherpad", "pod", function (err) { onError("db", err, cb, []) });
            },
            // get the newly created doc from the db
            function (cb)
            {
              db.doc.getDoc(docname, function (err, doc) { onError("db", err, cb, [doc]) });
            },
            // tell the documenttype that a new doc has been created
            function (_doc, cb)
            {
              doc = _doc;
              documentTypes.onCreateDoc(doc, function (err) { onError("doctype", err, cb, []) });
            },
            // GET getPodcastData from hoersuppe (preperation for template)
            function (cb)
            {
              hoerapi.getPodcastData(hoerPod.pod.podcast, function (err, podcastdata) { onError("tpl-hoer", err, cb, [podcastdata]) });
            },
            // generate the doc-text (template)
            function (podcastdata, cb)
            {
              var fields = { podcast: podcastdata, live: hoerPod.pod, doc: { name: docname } };
              db.template.getText(fields, function (err, text) { onError("tpl", err, cb, [text]) });
            },
            // set the doc-text
            function (text, cb)
            {
              documentTypes.setText(doc, text, function (err) { onError("tpl-doctype", err, cb, []) })
            }
          ],
          cb
        );
      },
      // create live2pad-entry & clear cache
      function (cb)
      {
        db.setSingleHash("live2pad", hoerid, docname);
        cache.del("clientpods");
        cb();
      },
      // tell xenim about the new doc
      function (cb)
      {
        if(nconf.get("xenim:disabled"))
        {
          return cb();
        }

        var xenimInfo = {};
        xenimInfo.docname = docname;
        xenimInfo.hoerid = hoerid;
        xenimInfo.hoerpod = hoerPod.pod.podcast;

        if(xenimAmqpExc)
        {
          tellXenim(xenimInfo);
        }
        else
        {
          console.log("Could send new doc to xenim: no connection");

          process.nextTick(function ()
          {
            console.log("Reconnecting to xenim..");
            initXenim(function (err)
            {
              var status = err ? ("error (" + err + ")") : "success";
              console.log("Reconnect status: " + status);

              if(!err)
              {
                tellXenim(xenimInfo);
              }
            });
          });
        }
        cb();
      }
    ],
    reply
  );

  function reply(err)
  {
    var status = null;

    if(err == "rate" || err == "docname")
      status = err;
    else if(err)
      status = "fail";
    else
      status = "ok";

    console.log("[%s] Creating doc: %s, err=%s", username, docname, err);
    res.json(status == "ok" ? 200 : 500, { status: status, docname: docname });
  }

  function tellXenim(xenimInfo)
  {
    try
    {
      xenimAmqpExc.publish('shownotes.padcreated', xenimInfo);
      console.log("New doc %s sent to xenim.", xenimInfo.docname);
    }
    catch (ex)
    {
      xenimAmqp = null;
      xenimAmqpExc = null;
    }
  }
}

function processDoc (req, res, mode)
{
  // db
  var docname = req.params.docname
    , user = res.locals.user
    , username = user ? user.username : "none"
    , doc
    , group

  // auth
  var isPublic
    , isAuthed
    , isText     = (mode == "text")
    , isReadonly = (mode == "readonly")
    , readonlyReason = null

  // ejs & util
  var locals = {}
    , logprefixstr = getShowDocStr(username, docname, "???", "???", "???", "???")


  async.waterfall(
    [
      // request doc
      function (cb)
      {
        db.doc.getDoc(docname, cb);
      },
      // get doc
      function (_doc, cb)
      {
        doc = _doc;

        if(!doc)
        {
          res.statusCode = 404;
          res.render('doc', { error: "nodoc" });
          cb("nodoc");
        }
        else
        {
          docname = doc.docname;
          locals.docname = docname;
          db.group.getGroup(doc.group, cb);
        }
      },
      // find out whether the client is allowed to view this document
      // and which mode to show them
      function (_group, cb)
      {
        group = _group;

        isPublic = (group.type == "open");
        // a user is authorized to view a document if
        //   *) the group is public
        //   *) the group is closed and the user is in the docs group
        isAuthed = !! (user && (user.inGroup(group.short) || isPublic));

        logprefixstr = getShowDocStr(username, docname, isPublic, isAuthed, isText, isReadonly);

        if((isAuthed || isPublic) && isText)
        {
          // return the text for readonly-view refreshes
          cb("text");
        }
        else if(isAuthed && !isReadonly)
        {
          // show the readwrite-view
          cb();
        }
        else if((isPublic && !isAuthed))
        {
          // show the readonly-view (because of missing auth)
          readonlyReason = "auth";
          cb("readonly");
        }
        else if(isReadonly && isAuthed)
        {
          // show the readonly-view (because the user used the /readonly-link)
          readonlyReason = "choosen";
          cb("readonly");
        }
        else
        {
          // auth-fail, show an error
          cb("auth");
        }
      },
      // try to show the document using the documenttype
      function (cb)
      {
        res.locals.err = null;
        console.log(logprefixstr + "showing doc");
        documentTypes.onRequestDoc(req, res, res.locals.user, doc, cb);
      }
    ],
    function (err)
    {
      if(err == "readonly")
      {
        locals.err = "readonly";
        locals.readonlyReason = readonlyReason;
        res.render('doc', locals);
      }
      else if(err == "text")
      {
        var cacheName = "doctext_" + docname;
        var clientDate;

        if(/[0-9{13}]/.test(req.query.t))
        {
          clientDate = new Date(parseInt(req.query.t, 10));
        }
        else
        {
          clientDate = new Date(0);
        }

        var text = cache.get(cacheName);

        // create dummy objects
        readonlyUsers[docname] = readonlyUsers[docname] || {};
        readonlyUsersTimeouts[docname] = readonlyUsersTimeouts[docname] || {};

        if(req.query["bot"] != 1)
        {
          var ip = req.ip;

          // remember this user and clear its timeout
          readonlyUsers[docname][ip] = true;
          if(readonlyUsersTimeouts[docname][ip])
          {
            clearTimeout(readonlyUsersTimeouts[docname][ip]);
          }

          // set a timeout of 2s to remove the user
          readonlyUsersTimeouts[docname][ip] = setTimeout(function () { delete readonlyUsers[docname][ip]; }, 2000);
        }

        // get the number of users
        var users = Object.keys(readonlyUsers[docname]).length;
        var respData =
        {
          status: "ok",
          users: users,
          date: +new Date()
        };

        async.waterfall(
          [
            function (cb)
            {
              documentTypes.getLastModifed(doc,
                function (err, lastMod)
                {
                  var isClientUpToDate = (lastMod < clientDate);
                  cb(isClientUpToDate ? "up2date" : null);
                }
              );
            },
            // try to get the text
            function (cb)
            {
              if(text)
              {
                // return the cached text
                cb(null, text);
              }
              else if(Object.keys(doc.snapshots).length != 0)
              {
                // return the latest snapshot
                var dates = Object.keys(doc.snapshots).sort();
                var snapshot = doc.snapshots[dates[0]];
                cb(null, snapshot.text);
              }
              else
              {
                // return the lastest OSF from the doctype
                documentTypes.getText(doc, cb);
              }
            },
            // send it to the client
            function (text, cb)
            {
              respData.text = text;
              cache.put(cacheName, text, 1000);
              res.json(200, respData);
              cb();
            }
          ],
          function (err)
          {
            if(err == "up2date")
            {
              respData.status = "up2date";
              res.json(200, respData);
            }
            else if(err)
            {
              console.error(logprefixstr + "error while showing doc in text-view:", err);
              res.statusCode = 500;
              res.end();
            }
          }
        );
      }
      else if(err)
      {
        console.warn(logprefixstr + "error while showing doc: " + err);

        var error = null;

        if(err == "auth")
        {
          error = err;
        }
        else if(err == "nodoc")
        {
          res.statusCode = 404;
          error = err;
        }
        else
        {
          error = "other";
        }

        locals.docname = docname;
        locals.err = error;

        res.render('doc', locals);
      }
    });
}

function getShowDocStr (username, docname, isPublic, isAuthed, isText, isReadonly)
{
  return "[" + username + "] " + docname + ", isPublic=" + isPublic +
                                           ", isAuthed=" + isAuthed +
                                           ", isText="   + isText +
                                         ", isReadonly=" + isReadonly + ", ";
}

function processDocSnapshot(req, res)
{
  var user = res.locals.user
    , docname = req.param("docname")
    , doc = null

  if(!docname)
  {
    res.writeHead(400);
    res.end();
    return;
  }

  if(!user.hasRole("reviewer"))
  {
    res.writeHead(401);
    res.end();
    return;
  }

  console.log("Attempting to save snapshot for doc %s..", docname);

  async.waterfall(
    [
      // get the doc
      function (cb)
      {
        db.doc.getDoc(docname, cb);
      },
      // get the doctext from the doctype
      function (_doc, cb)
      {
        doc = _doc;
        documentTypes.getText(doc, cb);
      },
      // save the current doctext as snapshot
      function (doctext, cb)
      {
        doc.snapshots["" + (+new Date())] =
        {
          text: doctext,
          user: user.username
        };

        var docChanges =
          {
            docname: docname,
            snapshots: doc.snapshots
          };

        db.doc.updateDoc(docChanges, cb);
      }
    ],
    function (err)
    {
      if(err)
      {
        console.log("Could save snapshot for doc %s: %s", docname, err);
        res.writeHead(500);
      }
      else
      {
        console.log("Snapshot for doc %s saved", docname);
        res.writeHead(200);
      }

      res.end();
    }
  )
}

function processLogin (req, res)
{
  req.assert('username', 'Empty username').regex(usernameRegex);
  req.assert('password', 'Empty password').notEmpty();

  var errors = req.validationErrors();
  var username = req.param('username');
  var password = req.param('password');

  var values = { username: username };

  if (errors)
  {
    res.redirect('/login?error=input&values=' + JSON.stringify(values));
    return;
  }

  db.user.getUser(username, function (err, user)
    {
      if(err)
      {
        console.info("[%s] Login failed: %s, user=%s", username, err, user);
        res.redirect('/login?error=pw&values=' + JSON.stringify(values));
        return;
      }
      
      if(user.status != "normal")
      {
        var error;

        if(user.status == "email" || user.status == "banned")
          error = user.status;
        else
          error = "unknown";

        console.info("[%s] Login failed: %s, status=%s", username, err, user.status);
        res.redirect('/login?error=' + error + '&values=' + JSON.stringify(values));
        return;
      }

      db.user.checkPassword(username, password, function (err, isValid)
        {
          if(!isValid || err)
          {
            console.info("[%s] Login failed: %s isValid=%s", username, err, isValid);
            res.redirect('/login?error=pw&values=' + JSON.stringify(values));
          }
          else
          {
            if(err)
            {
              console.info("[%s] Login failed (epl):", username, error);
              res.redirect('/login?error=epl&values=' + JSON.stringify(values));
            }
            else
            {
              console.info("[%s] Logged in", username);
              req.session.user = username;
              documentTypes.onLogin(user, res,
                function (err, result)
                {
                  var oldUrl = req.get("Referer");

                  if(oldUrl)
                  {
                    var parsedUrl = url.parse(oldUrl);
                    if(parsedUrl.pathname == "/login")
                      oldUrl = "/";
                  }
                  else
                  {
                    oldUrl = "/";
                  }

                  res.redirect(oldUrl);
                });
            }
          }
        });
    });
}

function processPasswordResetRequest (req, res)
{
  req.assert('username', 'Empty username').regex(usernameRegex);

  var errors = req.validationErrors();
  var username = req.param('username');

  var values = { username: username };

  if (errors)
  {
    res.redirect('/login?error=input');
    return;
  }

  var user;
  var emailToken;

  async.waterfall(
    [
      // get user
      function (cb)
      {
        db.user.getUser(username, cb);
      },
      // send mail
      function (_user, cb)
      {
        user = _user;
        emailToken = crypto.randomBytes(16).toString('hex');
        var emailTemplate = "pwreset-" + req.locale;
        var mailLocals =
        {
          username: username,
          page: pageurl,
          link: pageurl + "pwreset/" + username + "/" + emailToken
        };

        sendMail(emailTemplate, mailLocals, user.email, res.locals.__("pwreset.request.subject"), cb);
      },
      // save token in db
      function (mailreport, cb)
      {
        var userChanges = { username: user.username, pwResetToken: emailToken };
        db.user.updateUser(userChanges, cb);
      }
    ],
    function (err)
    {
      if(err)
        console.warn("[%s] PW-Reset-Request failed:", username, err);
      else
        console.warn("[%s] PW-Reset-Request succeeded", username);

      res.redirect('/pwreset?error=done');
    }
  )
}

function processPasswordReset (req, res)
{
  var username = req.params.username;
  var token = req.params.token;
  var password = req.body.password;

  var user = null;

  async.waterfall(
    [
      // get user
      function (cb)
      {
        db.user.getUser(username, cb);
      },
      // check token
      function (_user, cb)
      {
        user = _user;
        var tokenValid = (user.pwResetToken && user.pwResetToken == token);
        cb(tokenValid ? null : "invalidtoken");
      },
      // save new password to db
      function (cb)
      {
        var userChanges = {};
        userChanges.username = user.username;
        userChanges.pwResetToken = null;
        userChanges.password = password;

        db.user.updateUser(userChanges, cb);
      }
    ],
    function (err)
    {
      if(err)
      {
        console.info("[%s] PW-Reset failed:", username, err);

        if(err != "invalidpw")
          err = "other";
        res.redirect(req.path + "?error=" + err);
      }
      else
      {
        res.redirect("/login?error=pwchanged");
      }
    }
  )
}

function processLogout (req, res)
{
  var user = res.locals.user;
  if(!user)
  {
      res.redirect('/');
      return;
  }

  documentTypes.onLogout(user, res,
    function (err)
    {
      // delete our session
      req.session.user = null;
      console.debug("[%s] Logged out", user.username);
      // redirect the user back to the index
      res.redirect('/');
    });
}

function processRegister (req, res)
{
  req.assert('username', 'username-invalid').regex(usernameRegex);
  req.assert('email', 'email-invalid').isEmail();
  req.assert('password', 'pw-invalid').len(8, 255);
  req.assert('passwordr', 'pwr-invalid').len(8, 255);

  var errors = req.validationErrors() || [];

  var username = req.param('username');
  var password = req.param('password');
  var email = req.param('email');
  var passwordr = req.param('passwordr');
  var emailToken;

  var values =
    {
      username: username,
      email: email
    };

  if(password != passwordr)
  {
    errors.push({ msg: 'pw-match' });
  }

  if (errors.length != 0)
  {
    errors = getErrorArray(errors);
    res.redirect('/register?errors=' + JSON.stringify(errors) + "&values=" + JSON.stringify(values));
    return;
  }

  if(!registerLimiters[req.ip])
  {
    registerLimiters[req.ip] = new RateLimiter(2, 'minute', true);
  }

  async.series([
    // check the rate limiting
    function (cb)
    {
      registerLimiters[req.ip].removeTokens(1, cb);
    },
    // check captcha
    function (cb)
    {
      if(registerLimiters[req.ip].getTokensRemaining() < 1)
      {
        evaluateRecaptcha(req,
          function (err)
          {
            if(err)
            {
              res.statusCode = 429;
              res.redirect('/register?errors=["captcha"]&values=' + JSON.stringify(values));
            }
            else
            {
              cb();
            }
          }
        );
      }
      else
      {
        cb();
      }
    },
    // generate random string for activation mail
    function (cb)
    {
      crypto.randomBytes(16, function (err, bytes)
        {
          emailToken = bytes.toString('hex');
          cb();
        });
    },
    // create user in db and send activation mail
    function (cb)
    {
      db.user.createUser(username, password, email, emailToken, function (err)
        {
          // creating the user didn't work
          if(err)
          {
            console.info("[%s] Register failed (db):", username, err);
            var usererror;
            if(err == "userexists" || err == "emailexists")
              usererror = [err];
            else
              usererror = ["other-error"];
            res.redirect('/register?errors=' + JSON.stringify(usererror) + "&values=" + JSON.stringify(values));
            cb();
          }
          else
          {
            sendActivationMail(username, email, req.locale, emailToken,
              function (err, result)
              {
                // sending the email didn't work
                if(err)
                {
                  // delete the created user
                  db.user.deleteUser(username, function ()
                    {
                      console.info("[%s] Register failed (email):", username, err);
                      res.redirect('/register?errors=' + JSON.stringify(["email-error"]) + "&values=" + JSON.stringify(values));
                    }
                  );
                }
                else
                {
                  documentTypes.onCreateUser({ username: username, email: email },
                    function (err, result)
                    {
                      console.info("[%s] Registered", username);
                      res.redirect('/login?error=registered&values=[]');
                    }
                  );
                }

                cb();
              }
            );
          }
        }
      );
    }]
  );
}

function sendActivationMail(username, email, locale, emailToken, cb)
{
  var emailTemplate = "activation-" + locale;
  var mailLocals =
  {
    username: username,
    page: pageurl,
    link: pageurl + "activate/" + username + "/" + emailToken // pageurl *always* ends with '/'
  };

  // https://github.com/mashpie/i18n-node/blob/7fd1177b8e7e15387b79e7b5825693a5be3735a2/i18n.js#L280
  var subject = i18n.__.call({locale: locale}, "register.email.subject");

  console.info("[%s] Sending activation email", username);
  sendMail(emailTemplate, mailLocals, email, subject, cb);
}

function getErrorArray(errors)
{
  var newErrors = [];
  for(var e in errors)
  {
    newErrors.push(errors[e].msg);
  }
  return newErrors;
}

function processGetProfile(req, res)
{
  var user = res.locals.user;

  if(!user)
  {
    res.redirect('/login');
    return;
  }

  if(req.query["resend"])
  {
    var email = req.query["resend"];
    var foundToken = null;

    for (var token in user.activateEmailTokens)
    {
      var tokenEmail = user.activateEmailTokens[token].email;

      if(tokenEmail == email)
      {
        foundToken = token;
        break;
      }
    }

    if(!foundToken)
    {
      console.log("Email %s in %s could not be found.", email, user.username);
      res.redirect('/profile');
      return;
    }

    var emailTemplate = "changeemail-" + req.locale;
    var mailLocals =
    {
      username: user.username,
      page: pageurl,
      link: pageurl + "activate/" + user.username + "/" + foundToken
    };

    sendMail(emailTemplate, mailLocals, email, res.locals.__("profile.changeemail.subject"),
      function ()
      {
        res.redirect('/profile?errors=["resent"]&values=[]');
      });
  }
  else
  {
    res.render('profile');
  }
}

function processProfile(req, res)
{
  var user = res.locals.user;

  if(!user)
  {
    res.redirect('/login');
    return;
  }

  var username = user.username;

  req.assert('type', 'Invalid type').isIn(["password", "email"]);

  var errors = req.validationErrors();

  if(errors && errors.length != 0)
  {
    res.redirect('/profile?errors=["type"]');
    return;
  }

  var type = req.param('type');

  if(type == "password")
  {
    req.assert('newpassword', 'newpw-invalid').len(8, 255);
    req.assert('newpassword', 'newpwr-invalid').len(8, 255);
    req.assert('oldpassword', 'oldpassword-password').notEmpty();
    
    errors = req.validationErrors();

    var newpassword = req.param('newpassword');
    var newpasswordr = req.param('newpasswordr');
    var password = req.param('oldpassword');

    if(newpassword != newpasswordr)
    {
      if(!errors)
        errors = [];
      errors.push({ msg: 'newpassword-match' });
    }

    if(errors && errors.length != 0)
    {
      errors = getErrorArray(errors);
      res.redirect('/profile?errors=' + JSON.stringify(errors));
      return;
    }

    db.user.checkPassword(username, password,
      function (err, isValid)
      {
        if(err || !isValid)
        {
          console.info("[%s] Change password failed (password):", username, err);
          res.redirect('/profile?errors=["oldpassword-password"]&values=' + JSON.stringify(values));
        }
        else
        {
          var userChanges = { username: user.username, password: newpassword }
          db.user.updateUser(userChanges,
            function (err)
            {
              if(err)
              {
                console.info("[%s] Change password failed (db):", username, err);
                res.redirect('/profile?errors=["password-db"]&values=' + JSON.stringify(values));
              }
              else
              {
                console.info("[%s] Password changed", username);
                res.redirect('/profile?status=password-ok');
              }
            });
        }
      });
  }
  else if(type == "email")
  {
    req.assert('newemail', 'newemail').isEmail();
    req.assert('oldpassword', 'oldpassword-email').notEmpty();
    
    errors = req.validationErrors();

    var newemail = req.param('newemail');
    var password = req.param('oldpassword');

    var values = { newemail: newemail }

    if(errors && errors.length != 0)
    {
      errors = getErrorArray(errors);
      res.redirect('/profile?errors=' + JSON.stringify(errors) + '&values=' + JSON.stringify(values));
      return;
    }

    if(newemail == user.email)
    {
      res.redirect('/profile?status=email-same&values=' + JSON.stringify(values));
      return;
    }

    var emailToken;

    async.series(
      [
        // check password
        function (cb)
        {
          db.user.checkPassword(user.username, password,
            function (err, isValid)
            {
              if(err || !isValid)
              {
                console.info("[%s] Change email failed (password):", username, err);
                res.redirect('/profile?errors=["oldpassword-email"]&values=' + JSON.stringify(values));
                cb("oldpassword-email");
              }
              else
              {
                cb();
              }
            });
        },
        // check if user has already requested that change
        function (cb)
        {
          for (var token in user.activateEmailTokens)
          {
            var email = user.activateEmailTokens[token].email;

            if(email == newemail)
            {
              console.info("[%s] Change email failed (pending)", username);
              res.redirect('/profile?errors=["emailchange-pending"]&values=' + JSON.stringify(values));
              cb("emailchange-pending");
              return;
            }
          }
          cb();
        },
        // check if new email exists
        function (cb)
        {
          db.user.emailExists(newemail,
            function (err, exists)
            {
              if(err || exists)
              {
                console.info("[%s] Change email failed (emailexists): ", username, err);
                res.redirect('/profile?errors=["emailtaken"]&values=' + JSON.stringify(values));
                cb("emailexists");
              }
              else
              {
                cb();
              }
            });
        },
        // send email
        function (cb)
        {
          emailToken = crypto.randomBytes(16).toString('hex');
          var emailTemplate = "changeemail-" + req.locale;
          var mailLocals =
            {
              username: username,
              page: pageurl,
              link: pageurl + "activate/" + username + "/" + emailToken
            };

          sendMail(emailTemplate, mailLocals, newemail, res.locals.__("profile.changeemail.subject"), cb);
        },
        // save token to db
        function (cb)
        {
          user.addActivateEmailToken(emailToken, newemail);
          var userChanges = { username: user.username, activateEmailTokens: user.activateEmailTokens };

          db.user.updateUser(userChanges,
            function (err)
            {
              if(err)
              {
                console.info("[%s] Change email failed (db):", username, err);
                res.redirect('/profile?errors=["email-db"]&values=' + JSON.stringify(values));
              }
              else
              {
                console.info("[%s] Email changed to: %s, was: %s", username, newemail, user.email);
                res.redirect('/profile?status=email-ok');
              }
            });
        }
      ]
    );
  }
}

function sendDashboardUserActivation(req, res)
{
  var user = res.locals.user;
  if(!user || !user.hasRole("admin"))
    return res.redirect("/");

  var activationUser = req.param("username");

  async.waterfall(
    [
      function (cb)
      {
        db.user.getUser(activationUser, cb);
      },
      function (user, cb)
      {
        var tokens = Object.keys(user.activateEmailTokens);

        if(tokens.length != 1)
          return cb("token");

        var token = user.activateEmailTokens[tokens[0]];

        sendActivationMail(user.username, token.email, req.locale, tokens[0], cb);
      }
    ],
    function (err)
    {
      res.json({ result: err ? "fail" : "success" });
    }
  );
}

function processEmailActivation(req, res)
{
  var username = req.params.username;
  var token = req.params.token;

  db.user.getUser(username, function (err, user)
    {
      if(err)
      {
        console.info("[%s] Email activation failed (db):", username, err);
        res.end('Invalid link.');
        return;
      }

      var success = user.applyActivateEmailToken(token);
      if(success)
      {
        var userChanges = {};
        userChanges.username = username;
        userChanges.activateEmailTokens = user.activateEmailTokens;
        userChanges.email = user.email;

        if(user.status == "email")
          userChanges.status = "normal";

        db.user.updateUser(userChanges,
          function (err)
          {
            if(err)
            {
              console.info("[%s] Email activation failed (db):", username, err);
              res.end('Error. Please contact an administrator.');
            }
            else
            {
              if(user.status == "email")
              {
                console.info("[%s] Account activated (%s)", username, user.email);
                res.redirect('/login?error=activated&values=["' + username + '"]');
              }
              else
              {
                console.info("[%s] Email %s activated", username, user.email);
                res.redirect('/login?error=changed&values=["' + username + '"]');
              }
            }
          });
      }
      else
      {
        console.info("[%s] Account activation failed (token)", username);
        res.end('Invalid link.');
        return;
      }
    });
}

function sendMail(template, locals, to, subject, cb)
{
  async.waterfall([
      // load the template file
      function (_cb)
      {
        fs.readFile(path.resolve(__dirname + '/../email-templates') + '/' + template + '.ejs', _cb);
      },
      // process the template file
      function (content, _cb)
      {
        content = content+""; // content to string
        _cb(null, ejs.render(content, locals));
      },
      // send mail
      function (content, _cb)
      {
        var mailOptions =
          {
            from: nconf.get("mail:from"),
            to: to,
            subject: subject,
            text: content
          };

        console.debug("Sending mail (%s) to", template, to);
        mailTransport.sendMail(mailOptions, _cb);
      }
    ], cb);
}

function getRecaptchaHTML()
{
  var recaptcha = new Recaptcha(nconf.get("recaptcha:publickey"), nconf.get("recaptcha:publickey"));
  return recaptcha.toHTML();
}

function evaluateRecaptcha(req, cb)
{
  var data =
    {
      remoteip:  req.connection.remoteAddress,
      challenge: req.body.recaptcha_challenge_field,
      response:  req.body.recaptcha_response_field
    };

  if(!data.challenge || !data.response)
  {
    cb("nocaptcha");
  }
  else
  {
    var recaptcha = new Recaptcha(nconf.get("recaptcha:publickey"), nconf.get("recaptcha:publickey"), data);

    recaptcha.verify(function(success, error_code)
    {
      if (success)
      {
        cb("invalid");
      }
      else
      {
        cb(null);
      }
    });
  }
}

function processPublicDocnames(req, res)
{
  var cacheName = "publicdocnames";

  async.waterfall(
    [
      // check the cache
      function (cb)
      {
        var docs = cache.get(cacheName);

        if(docs)
          cb("cache", docs);
        else
          cb();
      },
      // get docnames
      function (cb)
      {
        db.getObjectsOfType('doc', cb);
      },
      // get live2pad-mapping
      function (docnames, cb)
      {
        db.getHash("live2pad",
          function (err, liveToDoc)
          {
            if(err)
            {
              cb(err);
            }
            else
            {
              cb(null, docnames, liveToDoc);
            }
          }
        );
      },
      // add live-ids to docnames
      function (docnames, liveToDoc, cb)
      {
        var docs = [];
        var liveLookup = {};

        for (var id in liveToDoc)
        {
          liveLookup[liveToDoc[id]] = id;
        }

        for (var i = 0; i < docnames.length; i++)
        {
          docs.push(
            {
              docname: docnames[i],
              hoerid: liveLookup[docnames[i]] || null
            }
          )
        }

        cache.put(cacheName, docs, 10000);
        cb(null, docs);
      }
    ],
    function (err, result)
    {
      var resp =
      {
        "status": 200,
        "message": "ok",
        "data": result
      };

      if(err && err != "cache")
      {
        resp.status = 500;
        resp.data = null;
      }

      res.json(resp.status, resp);
    }
  );
}
