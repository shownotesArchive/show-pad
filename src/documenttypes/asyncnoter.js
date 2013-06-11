var async   = require('async')
  , express = require('express')
  , path    = require('path')
  , crypto  = require('crypto')
  , url     = require('url')
  , http    = require('http')
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

  app.get("/createasync", getCreateAsync);
  app.post("/createasync", postCreateAsync);
  app.get("/createasync/checkstatus", getCreateAsyncCheckStatus);
}

function getCreateAsync(req, res)
{
  if(!canCreateDoc(res.locals.user))
    return res.redirect("/");

  res.render('documenttypes/asyncnoter_create.ejs', {});
}

function postCreateAsync(req, res)
{

}

function getCreateAsyncCheckStatus(req, res)
{
  if(!canCreateDoc(res.locals.user) || !req.query.url)
    return res.end();

  var fileUrl = url.parse(req.query.url);

  console.log("Requesting %s//%s%s for %s", fileUrl.protocol, fileUrl.host, fileUrl.pathname, res.locals.user.username);

  var options =
  {
    hostname: fileUrl.hostname,
    port: fileUrl.port,
    path: fileUrl.pathname,
    method: 'HEAD',
    agent: false // => `Connection: close`
  };

  var fileReq = http.request(options, function(fileRes)
  {
    res.json({ result: "ok", status: fileRes.statusCode });
  });

  fileReq.on('error', function(e)
  {
    res.json({ result: "error" });
  });

  fileReq.end();
}

function canCreateDoc(user)
{
  return user && user.hasRole("podcaster");
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
            var metaOps = [];
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
              else if(type == "insert" || type == "delete")
              {
                var metaOp = { "p": [ "meta", ops[op].p[1] ] };

                if(type == "insert")
                  metaOp["li"] = { creator: username, createtime: +new Date() };
                else if(type == "delete")
                  metaOp["ld"] = {};

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

function checkOp(op)
{
  if(!op.p || (op.p[0] != "notes" || op.p.length != 2))
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
    pageurl: server.pageurl,
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

        for (var i = 0; i < notes.length; i++)
        {
          notes[i].index = i;
        }

        notes.sort(
          function (a, b)
          {
            if(a.time != b.time)
              return a.time - b.time;
            else
              return a.index - b.index;
          }
        );

        var osf = "HEADER\n/HEADER\n";

        for (var i = 0; i < notes.length; i++)
        {
          osf += "\n" + getHumanTime(notes[i].time) + " " + notes[i].text;
        }

        cb(null, osf);
      }
    ],
    cb
  );
}

function getHumanTime(time)
{
  var seconds = pad(time % 60, 2);
  var minutes = pad(Math.floor(time % 60), 2);
  var hours = pad(Math.floor(time / 3600), 2);

  return hours + ":" + minutes + ":" + seconds;

  // http://stackoverflow.com/a/10073788
  function pad(n, width, z) {
    z = z || '0';
    n = n + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
  }
}

/* other */
exports.getLastModifed = function (doc, cb)
{
  cb();
}
