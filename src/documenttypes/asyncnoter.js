var async   = require('async')
  , express = require('express')
  , crypto  = require('crypto')
  , sharejs = require('share')
  , pluginloader = require('../pluginloader.js')

var server = null
  , logger = null
  , model  = null
  , plugins = null
  , sessions = {}

exports.name = "asyncnoter";

/* Init */
exports.init = function (_server, cb)
{
  server = _server;
  logger = server.getLogger(exports.name);

  pluginloader.load("./src/documenttypes/asyncnoter/", [exports, server, logger], logger,
    function (err, _plugins)
    {
      exports.plugins = plugins = _plugins;
    }
  );

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

  sharejs.server.attach(app, options);
  model = app.model;

  updateDocuments();

  plugins["async-routes"].initExpress(app);
}

function updateDocuments()
{
  async.waterfall(
    [
      // get all docs
      function (cb)
      {
        server.db.doc.getDocs(cb);
      },
      // filter asyncnoter docs
      function (docs, cb)
      {
        async.filter(docs,
          function (doc, cb)
          {
            cb(doc.type == exports.name);
          },
          function (docs)
          {
            cb(null, docs);
          }
        );
      },
      function (docs, cb)
      {
        plugins["async-sharejsupdater"].updateDocuments(docs, model, cb);
      }
    ]
  );
}

function canCreateDoc(user)
{
  return user && user.hasRole("podcaster");
}

exports.canCreateDoc = canCreateDoc;

function auth(agent, action)
{
  var username = sessions[agent.authentication];
  var user = null;
  var snapshot = null;

  if(!username)
  {
    action.reject();
    return;
  }

  async.series(
    [
      // get user from DB
      function (cb)
      {
        server.db.user.getUser(username,
          function (err, _user)
          {
            if(err)
            {
              sessions[agent.authentication] = null;
            }
            user = _user;
            cb(err);
          }
        );
      },
      // get the documents state at the time this action was created
      function (cb)
      {
        if(action.docName && action.type != "read")
        {
          getSnapshotAtRevision(action.docName, action.v,
            function (err, _snapshot)
            {
              snapshot = _snapshot;
              cb(err);
            }
          );
        }
        else
        {
          cb();
        }
      },
      // check the action
      function (cb)
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
            var metaOps = [];
            var allowed = true;

            for (var op in ops)
            {
              var type = checkOp(ops[op]);
              var canDelete = false;

              if(type == "delete")
              {
                if(user.hasRole('admin'))
                {
                  canDelete = true;
                }
                else
                {
                  var metaContent = snapshot.meta[ops[op].p[1]];

                  if(metaContent.creator == username)
                  {
                    canDelete = true;
                  }
                }
              }

              if(type == "invalid" ||
                 type == "delete" && !canDelete)
              {
                allowed = false;
                break;
              }
              else if(type == "insert" || type == "delete")
              {
                var metaOp = { "p": [ "meta", ops[op].p[1] ] };

                if(type == "insert")
                  metaOp["li"] = { creator: username, createtime: +new Date(), editors: {} };
                else if(type == "delete")
                  metaOp["ld"] = {};

                metaOps.push(metaOp);
              }
              else if(type == "edit")
              {
                var metaOp = { "p": [ "meta", ops[op].p[1], "editors", username ] };

                metaOp["oi"] = { createtime: +new Date() };

                metaOps.push(metaOp);
              }
            }

            if(allowed)
            {
              applyOp(action.docName, metaOps, action.v,
                function (err)
                {
                  if(err)
                  {
                    logger.error("Could not apply user change:", err);
                    allowed = false;
                  }

                  handleAction(action, username, allowed);
                }
              );
            }
            else
            {
              handleAction(action, username, false);
            }
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

function getSnapshotAtRevision(docname, v, cb)
{
  var snapshot
    , content
    , ops = []

  async.waterfall(
    [
      // get latest revision
      function (cb)
      {
        model.getSnapshot(docname,
          function (err, _snapshot)
          {
            snapshot = _snapshot;
            content = snapshot.snapshot;
            cb(err);
          }
        );
      },
      // get ops that happend between `v` and `snapshot.v`
      function (cb)
      {
        if(v == snapshot.v)
          return cb();

        model.getOps(docname, v, snapshot.v,
          function (err, _ops)
          {
            ops = _ops;
            cb(err);
          }
        );
      },
      // invert and apply ops
      function (cb)
      {
        var json = sharejs.types.json;
        var err = null;

        try
        {
          for (var i = ops.length - 1; i >= 0; i--) // reverse order
          {
            var op = ops[i].op;
            op = json.invert(op);
            content = json.apply(content, op);
          }
        }
        catch (_err)
        {
          err = _err;
        }

        cb(err, content);
      }
    ],
    cb
  );
}

function checkOp(op)
{
  if(!op.p || (op.p[0] != "notes" || op.p.length < 2))
  {
    return "invalid";
  }

  // editing
  if(isValidVal(op.oi) && isValidVal(op.od) && Object.keys(op).length == 3)
  {
    return "edit";
  }

  // inserting
  if(op.li && Object.keys(op).length == 2)
  {
    var note = op.li;
    var isValid = isNumber(note.time) &&
                  isString(note.text) &&
                  Object.keys(note).length == 2;

    return isValid ? "insert" : "invalid";
  }

  // deleting
  if(op.ld && Object.keys(op).length == 2)
  {
    return "delete";
  }

  return "invalid";
}

function isValidVal(obj)
{
  return obj || obj == 0;
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
        var op = { "p":[], "oi": { meta:[], notes: [] } };
        applyOp(doc.docname, op, 0, cb);
      }
    ],
    cb
  );
}

function applyOp(docname, op, v, cb)
{
  if(!Array.isArray(op))
  {
    op = [op];
  }

  var opData =
  {
    op: op,
    v: v
  };

  model.applyOp(docname, opData, cb);
}

exports.applyOp = applyOp;

exports.onDeleteDoc = function (doc, cb)
{
  model.delete(doc.docname, cb);
}

exports.onRequestDoc = function (req, res, user, doc, cb)
{
  var token = crypto.randomBytes(42).toString('hex');
  sessions[token] = user.username;

  var mediaurls = [];

  if(doc.async && doc.async.mediaurls)
    mediaurls = doc.async.mediaurls;

  var locals =
  {
    docname: doc.docname,
    pageurl: server.pageurl,
    groupname: doc.group,
    authtoken: token,
    mediaurls: mediaurls,
    mediatypes: { "ogg": 'audio/ogg; codecs="vorbis"', 'mp3': 'audio/mpeg' }
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
  async.waterfall(
    [
      // get the doc content from ShareJS
      function (cb)
      {
        model.getSnapshot(doc.docname, cb);
      },
      // convert doc content to OSF
      function (state, cb)
      {
        var notes = state.snapshot.notes;
        plugins["async-osftools"].osfFromNotes(notes, cb);
      }
    ],
    cb
  );
}

/* other */
exports.getLastModifed = function (doc, cb)
{
  cb();
}
