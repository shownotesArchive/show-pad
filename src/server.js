var express   = require('express')
  , ShareJS   = require('share').server
  , async     = require('async')
  , log4js    = require('log4js')
  , cookie    = require('cookie')
  , signature = require('cookie-signature')
  , nconf     = require('nconf')
  , email     = require('email').Email
  , ejs       = require('ejs')
  , fs        = require('fs')
  , crypto    = require('crypto')
  , i18n      = require("i18n")
  , path      = require('path')
  , expressValidator = require('express-validator');

var db            = require('./db.js')
  , api           = require('./api.js')
  , app           = null
  , sessionStore  = null
  , sessionSecret = null;

log4js.replaceConsole();
console.info("Let's go");

async.series([
  initConfig,
  initDatabase,
  initApi,
  initi18n,
  initServer,
  startServer,
  function (cb)
  {
    console.info("All done!");
    cb(null);
  }
]);

function initConfig(cb)
{
  nconf.file({ file: 'config.json' });

  nconf.defaults({
      'http': {
          'ip': "0.0.0.0",
          'port': 8080
      }
  });

  sessionSecret = nconf.get("sessions:secret");
  if(!sessionSecret || sessionSecret.length == 0)
  {
    console.error("No session-secret given in config.json");
    process.exit(1);
  }

  cb();
}

function initDatabase(cb)
{
  console.info("Initiating database..");
  db.init(nconf.get("database"), cb);
}

function initApi(cb)
{
  api.init(db, cb);
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
  app.configure(function()
  {
    app.set('view engine', 'ejs');
    app.use(express.static(path.resolve(__dirname + '/../static')));
    app.use(express.cookieParser());

    console.info("Initiating server-i18n..");
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

    console.info("Initiating server-ShareJS..");
    ShareJS.attach(app, 
      {
        db: { client: db.getClient() },
        auth: authenticate
      });

    app.use(express.bodyParser());
    app.use(expressValidator);

    // sessions
    sessionStore = new express.session.MemoryStore();
    app.use(express.session({ secret: sessionSecret, store: sessionStore }));

    console.info("Initiating server-routes..");
    // routes
    app.get('/', function(req, res) { res.render('index'); });

    // UI
    app.get('/login', function(req, res) { res.render('login'); });
    app.post('/login', processLogin);

    app.get('/register', function(req, res) { res.render('register'); });
    app.post('/register', processRegister);

    app.get('/dashboard', function(req, res) { res.render('dashboard'); });

    app.get('/logout', function(req, res)
      {
        req.session.user = null;
        res.redirect('/');
      });

    // email activation
    app.get('/activate/:username/:token', processEmailActivation);

    // API
    app.get('/api/:version/users', function (req, res) { api.handle('get-users', req, res); });
    app.get('/api/:version/users/:name', function (req, res) { api.handle('get-user', req, res); });

    cb(null);
  });
}

function startServer(cb)
{
  console.info("Starting database..");
  app.listen(nconf.get("http:port"), nconf.get("http:ip"), cb);
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

  var user = db.user.getUser(username, function (err, user)
    {
      if(err)
      {
        console.info("[" + username + "] Login failed: " + err + ", user=" + user);
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

        console.info("[" + username + "] Login failed: status=" + user.status);
        res.redirect('/login?error=' + error + '&values=' + JSON.stringify(values));
        return;
      }

      db.user.checkPassword(username, password, function (err, isValid)
        {
          if(!isValid || err)
          {
            console.info("[" + username + "] Login failed: " + err + " isValid=" + isValid);
            res.redirect('/login?error=pw&values=' + JSON.stringify(values));
          }
          else
          {
            console.info("[" + username + "] Logged in");
            req.session.user = username;
            res.redirect('/');
          }
        });
    });
}

function processRegister (req, res)
{
  req.assert('username', 'username-invalid').notEmpty().isAlpha();
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

  var emailToken;
  var mailLocals =
    {
      username: username,
      page: nconf.get("pageurl"),
      link: nconf.get("pageurl") + "/activate/" + username + "/"
    };

  async.series([
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
            console.info("[" + username + "] Register failed (db): " + err);
            var usererror;
            if(err == "userexists")
              usererror = [err];
            else
              usererror = ["other-error"];
            res.redirect('/register?errors=' + JSON.stringify(usererror) + "&values=" + JSON.stringify(values));
          }
          else
          {
            sendMail("activation-en", mailLocals, email, res.locals.__("register.email.subject"), function (err, result)
              {
                // sending the email didn't work
                if(err)
                {
                  // delete the created user
                  db.user.deleteUser(username, function ()
                    {
                      console.info("[" + username + "] Register failed (email): " + err);
                      res.redirect('/register?errors=' + JSON.stringify(["email-error"]) + "&values=" + JSON.stringify(values));
                    });
                }
                else
                {
                  console.info("[" + username + "] Registered");
                  res.redirect('/login');
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

function processEmailActivation(req, res)
{
  var username = req.params.username;

  if(!username.match(/^[a-zA-Z0-9]+$/))
  {
    res.end('Invalid link.');
    return;
  }

  var user = db.user.getUser(username, function (err, user)
    {
      if(err || user.status != "email")
      {
        res.end('Invalid link.');
        return;
      }

      var token = req.params.token;

      if(user.emailToken == token)
      {
        user.status = "normal";
        db.user.updateUser(user);
        res.redirect('/login');
      }
      else
      {
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
        var msg = new email(
          {
            from: nconf.get("mail:from"),
            to: to,
            subject: subject,
            body: content
          });
        msg.send(_cb);
      }
    ], cb);
}

function authenticate(agent, action)
{
  async.waterfall([
      // get the session-id
      function (cb)
      {
        var cookies = cookie.parse(agent.headers.cookie);
        var sid = cookies["connect.sid"];
        sid = signature.unsign(sid.slice(2), sessionSecret);
        cb(null, sid);
      },
      // get the session-object
      function (sid, cb)
      {
        sessionStore.get(sid, cb);
      },
      // get the user
      function (session, cb)
      {
        // when memoryStore does not give us a single parameter back..
        if(!cb && typeof session == "function")
          cb = session;

        session = session || {};
        var username = session.user;
        if(username)
          db.user.getUser(username, cb);
        else
          cb(null, null);
      },
      // process the action
      function (user, cb)
      {
        switch(action.type)
        {
         // connecting for everyone, also set the name
         case "connect":
            var name = "unnamed";
            if(user) name = user.username;
            agent.name = name;
            handleAction(action, true);
            break;

          // creating and changing docs for registred users
         case "create":
         case "update":
            if(user)
              handleAction(action, true);
            else
              handleAction(action, false);
            break;

          // allow read for everyone
          case "read":
            handleAction(action, true);
            break;

          // forbid delete for everyone
          case "delete":
            handleAction(action, false);
            break;
        }
      }
    ]);
}

function handleAction(action, accept)
{
  if(["update"].indexOf(action.type) == -1)
    console.debug("ShareJS-Action: " + action.type + (accept ? " accepted" : " rejected"));

  if(accept)
    action.accept();
  else
    action.reject();
}
