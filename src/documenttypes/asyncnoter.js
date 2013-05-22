var async   = require('async')
  , express = require('express')
  , path    = require('path')
  , crypto  = require('crypto')
  , sharejs = require('share').server

var server = null
  , logger = null
  , model  = null
  , sessions = {}

exports.name = "asyncnoter";

/* Init */
exports.init = function (_server, cb)
{
  server = _server;
  logger = server.getLogger(exports.name);

  cb();
}

exports.initExpress = function (app)
{
  var options =
    {
      staticpath: "/sharejs",
      browserChannel:
      {
        base: "/sharejs/sock_bc",
        cors: '*'
      },
      rest:
      {
        base: "/sharejs/rest"
      },
      auth: auth,
      db:
      {
        type: 'redis',
        client: server.db.getClient()
      }
    };

  sharejs.attach(app, options);
  model = app.model;
  app.use("/sharejs/channel", express.static(path.resolve(__dirname + '/../../node_modules/share/node_modules/browserchannel/dist')));
  app.use("/jwerty", express.static(path.resolve(__dirname + '/../../node_modules/jwerty')));
}

function auth(agent, action)
{
  var username = sessions[agent.authentication];

  if(!username)
  {
    action.reject();
    return;
  }

  async.waterfall(
    [
      // get user from DB
      function (cb)
      {
        server.db.user.getUser(username,
          function (err, user)
          {
            if(err)
            {
              sessions[agent.authentication] = null;
            }
            cb(err, user);
          }
        );
      },
      // check the action
      function (user, cb)
      {
        switch(action.type)
        {
          // connecting for authed users, also set the name
          case "connect":
            agent.name = username;
            handleAction(action, username, true);
            break;

          // updating for authed users, but with validation
          case "update":
            var ops = action.op;
            var allowed = true;
            var canDelete = user.hasRole('admin');

            for (var op in ops)
            {
              var type = checkOp(ops[op]);

              if(type == "invalid" ||
                 type == "delete" && !canDelete)
              {
                allowed = false;
                break;
              }
            }

            handleAction(action, username, allowed);
            break;

          // creating & deleting for nobody.
          // this is done serverside in onCreateDoc / onDeleteDoc
          case "create":
          case "delete":
            handleAction(action, username, false);
            break;

          // reading for authed users
          case "read":
            handleAction(action, username, true);
            break;
        }

        cb();
      }
    ],
    function (err)
    {
      if(err && !action.responded)
      {
        action.reject();
      }
    }
  );
}

function checkOp(op)
{
  if(!op.p)
  {
    return "invalid";
  }

  if(op.li && Object.keys(op).length == 2)
  {
    var note = op.li;
    var isValid = isNumber(note.time) &&
                  isString(note.text) &&
                  Object.keys(note).length == 2;

    return isValid ? "insert" : "invalid";
  }

  if(op.ld && Object.keys(op).length == 2)
  {
    return "delete";
  }

  return "invalid";
}

// http://stackoverflow.com/a/1830844
function isNumber(n) {
  return !isNaN(parseFloat(n)) && isFinite(n);
}

function isString(s) {
  return typeof s == "string";
}

function handleAction(action, username, accept)
{
  if(["update"].indexOf(action.type) == -1)
  {
    console.debug("[%s] [%s] ShareJS-Action: %s (%s)",
      action.docName,
      username,
      action.type,
      accept ? "accepted" : "rejected");
  }

  if(accept)
    action.accept();
  else
    action.reject();
}

/* Users */
exports.onLogin = function (user, res, cb)
{
  cb();
}

exports.onCreateUser = function (user, cb)
{
  cb();
}

exports.onLogout = function (user, res, cb)
{
  cb();
}

/* Groups */
exports.onCreateGroup = function (group, cb)
{
  cb();
}

/* Docs */
exports.onCreateDoc = function (doc, cb)
{
  async.series(
    [
      // create the doc
      function (cb)
      {
        model.create(doc.docname, "json", cb);
      },
      // set the doc-content to []
      function (cb)
      {
        var opData =
        {
          op: [{"p":[],"oi":[]}],
          v: 0
        };
        model.applyOp(doc.docname, opData, cb);
      }
    ],
    cb
  );
}

exports.onDeleteDoc = function (doc, cb)
{
  model.delete(doc.docname, cb);
}

exports.onRequestDoc = function (req, res, user, doc, cb)
{
  var token = crypto.randomBytes(42).toString('hex');
  sessions[token] = user.username;
  var locals =
  {
    docname: doc.docname,
    groupname: doc.group,
    authtoken: token
  };

  res.render('documenttypes/asyncnoter.ejs', locals);
  cb();
}

/* Pad text */
exports.setText = function (doc, text, cb)
{
  cb();
}

exports.getText = function (doc, cb)
{
  cb();
}

/* other */
exports.getLastModifed = function (doc, cb)
{
  cb();
}
