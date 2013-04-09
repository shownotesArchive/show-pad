var express   = require('express')
  , ejslocals = require('ejs-locals')
  , async     = require('async')
  , log4js    = require('log4js')
  , cookie    = require('cookie')
  , nconf     = require('nconf')
  , ejs       = require('ejs')
  , fs        = require('fs')
  , crypto    = require('crypto')
  , i18n      = require("i18n")
  , path      = require('path')
  , cache     = require('memory-cache')
  , Recaptcha = require('recaptcha').Recaptcha
  , nodemailer       = require('nodemailer')
  , RateLimiter      = require('limiter').RateLimiter
  , expressValidator = require('express-validator');

var db            = require('./db.js')
  , api           = require('./api.js')
  , documentTypes = require('./documenttypes.js')
  , app           = null
  , mailTransport = null
  , pageurl       = null
  , sessionStore  = null
  , sessionSecret = null;

// rate limiters
var registerLimiters = {};

// exports
exports.documentTypes = documentTypes;
exports.nconf = nconf;
exports.db = db;

// startup
log4js.replaceConsole();
console.info("Let's go");

async.series([
  initConfig,
  initMail,
  initDatabase,
  initDocTypes,
  initApi,
  initi18n,
  initServer,
  startServer,
  function (cb)
  {
    console.info("All done!");
    cb(null);
  }
],
function (err)
{
  if(err)
  {
    console.error(err);
    process.exit(1);
  }
});

function initConfig(cb)
{
  console.info("Initiating configuration..");
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
  console.info("Initiating mail (%s)..", type);
  mailTransport = nodemailer.createTransport(type, nconf.get('mail:options'));
  cb();
}

function initDatabase(cb)
{
  console.info("Initiating database..");
  db.init(nconf.get("database"), cb);
}

function initDocTypes(cb)
{
  console.info("Initiating doctypes..");
  documentTypes.init(exports, cb);
}

function initApi(cb)
{
  console.info("Initiating api..");
  api.init(exports, cb);
}

function initi18n(cb)
{
  console.info("Initiating i18n..");
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
  console.info("Initiating server..");

  app = express();
  app.engine('ejs', ejslocals);
  app.set('view engine', 'ejs');
  app.use(express.static(path.resolve(__dirname + '/../static')));
  app.use(express.cookieParser());

  console.debug("Initiating server-i18n..");
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

  console.debug("Initiating server-forms..");
  app.use(express.bodyParser());
  app.use(expressValidator);

  console.debug("Initiating server-sessions..");
  // sessions
  sessionStore = new express.session.MemoryStore();
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

  console.debug("Initiating doctypes (express)..");
  documentTypes.onExpressInit(app);

  console.debug("Initiating server-routes..");
  // routes
  app.get('/', processIndex);
  app.get('/doc/:docname', function (req, res) { processDoc(req, res, "normal"); });
  app.get('/doc/:docname/readonly', function (req, res) { processDoc(req, res, "readonly"); });
  app.get('/doc/:docname/text', function (req, res) { processDoc(req, res, "text"); });

  // UI
  app.get('/login', function(req, res) { res.render('login'); });
  app.post('/login', processLogin);

  app.get('/pwreset', function (req, res) { res.render("pwreset-request"); });
  app.post('/pwreset', processPasswordResetRequest);

  app.get('/pwreset/:username([a-zA-Z0-9]+)/:token', function (req, res) { res.render("pwreset"); });
  app.post('/pwreset/:username([a-zA-Z0-9]+)/:token', processPasswordReset);

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

  app.get('/logout', processLogout);

  // email activation
  app.get('/activate/:username([a-zA-Z0-9]+)/:token', processEmailActivation);

  // API
  app.get('/api/:version/:endpoint/:entity?', api.handleRequest);
  app.post('/api/:version/:endpoint/:entity?', api.handleRequest);
  app.put('/api/:version/:endpoint/:entity?', api.handleRequest);
  app.delete('/api/:version/:endpoint/:entity?', api.handleRequest);

  cb(null);
}

function startServer(cb)
{
  console.info("Starting http..");
  app.listen(nconf.get("http:port"), nconf.get("http:ip"), cb);
}

function processIndex (req, res)
{
  var cacheName = "indexdocs";

  async.waterfall(
    [
      // check the cache
      function (cb)
      {
        var docs = cache.get(cacheName);
        console.log(docs);
        if(docs)
          cb("cache", docs);
        else
          cb();
      },
      // get all docs
      function (cb)
      {
        db.doc.getDocs(cb);
      },
      // get all last-modfieds for docs
      function (docs, cb)
      {
        async.map(docs, documentTypes.getLastModifed,
          function (err, times)
          {
            if(err)
              cb("epl");
            else
              cb(err, docs, times);
          });
      },
      // create a nice list for the client and render it
      function (docs, times, cb)
      {
        var clientDocs = [];

        for (var i = 0; i < docs.length; i++)
        {
          var doc = docs[i];
          var time = times[i];
          clientDocs.push({ docname: doc.docname, modified: time.lastEdited });
        }

        clientDocs.sort( function (a, b) { return b.modified - a.modified; });
        clientDocs.splice(nconf.get("docsonindex"));
        cache.put(cacheName, clientDocs, 30000);

        cb(null, clientDocs);
      }
    ],
    function (err, result)
    {
      if(err && err != "cache")
      {
        console.error("Error while rendering index: " + err);
        result = [];
      }

      res.render('index', { docs: result });
    }
  )
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
    , logprefixstr = ""


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
      // get the doc-group
      function (_group, cb)
      {
        group = _group;

        isPublic = (group.type == "open");
        isAuthed = !! (user && (user.inGroup(group.short) || isPublic));

        logprefixstr = getShowDocStr(username, docname, isPublic, isAuthed, isText, isReadonly);

        if((isAuthed || isPublic) && isText)
        {
          // show the readwrite-view
          cb("text");
        }
        else if(isAuthed && !isReadonly)
        {
          // show the readwrite-view
          cb();
        }
        else if((isPublic && !isAuthed))
        {
          // show the readonly-view
          readonlyReason = "auth";
          cb("readonly");
        }
        else if(isReadonly && isAuthed)
        {
          // show the readonly-view
          readonlyReason = "choosen";
          cb("readonly");
        }
        else
        {
          // fail
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
        var text = cache.get(cacheName);

        if(text)
        {
          res.write(text);
          res.end();
        }
        else
        {
          documentTypes.getText(doc,
            function (err, text)
            {
              if(err)
              {
                console.err(logprefixstr + "error while showing doc in text-view: " + err);
              }
              else
              {
                cache.put(cacheName, text, 1000);
                res.write(text);
                res.end();
              }
            }
          );
        }
      }
      else if(err)
      {
        console.warn(logprefixstr + "error while showing doc: " + err);

        if(err != "auth" && err != "nodoc")
          locals.err = "other";
        else
          locals.err = err;

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

function processLogin (req, res)
{
  req.assert('username', 'Empty username').notEmpty().isAlphanumeric();
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
                  if(!oldUrl)
                    oldUrl = "/";
                  res.redirect(oldUrl);
                });
            }
          }
        });
    });
}

function processPasswordResetRequest (req, res)
{
  req.assert('username', 'Empty username').notEmpty().isAlphanumeric();

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
  req.assert('username', 'username-invalid').notEmpty().isAlphanumeric();
  req.assert('email', 'email-invalid').isEmail();
  req.assert('password', 'pw-invalid').len(8, 255);
  req.assert('passwordr', 'pwr-invalid').len(8, 255);

  var errors = req.validationErrors();

  var username = req.param('username');
  var password = req.param('password');
  var email = req.param('email');
  var password = req.param('password');
  var passwordr = req.param('passwordr');

  if(!errors)
    errors = [];

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

  var emailToken;
  var mailLocals =
    {
      username: username,
      page: pageurl,
      link: pageurl + "activate/" + username + "/" // pageurl *always* ends with '/'
    };

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
          });
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
          mailLocals.link += emailToken;
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
          }
          else
          {
            var emailTemplate = "activation-";
            emailTemplate += req.locale;

            sendMail(emailTemplate, mailLocals, email, res.locals.__("register.email.subject"), function (err, result)
              {
                // sending the email didn't work
                if(err)
                {
                  // delete the created user
                  db.user.deleteUser(username, function ()
                    {
                      console.info("[%s] Register failed (email):", username, + err);
                      res.redirect('/register?errors=' + JSON.stringify(["email-error"]) + "&values=" + JSON.stringify(values));
                    });
                }
                else
                {
                  documentTypes.onCreateUser({ username: username, email: email },
                    function (err, result)
                    {
                      console.info("[%s] Registered", username);
                      res.redirect('/login?error=registered&values=[]');
                    });
                }
              });
          }
        });
    }]);
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
