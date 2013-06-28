var async   = require('async')
  , express = require('express')
  , path    = require('path')
  , crypto  = require('crypto')
  , url     = require('url')
  , http    = require('http')
  , sharejs = require('share')
  , HTTPStatus = require('http-status')

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

  sharejs.server.attach(app, options);
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
  var docname = req.param("docname");
  var mediaurls = req.param("formats");
  var newMediaurls = []
    , useableMediaurls = []
    , doc = null
    , values =
      {
        "docname": docname
      }

  for (var media in mediaurls)
  {
    var uurl = mediaurls[media];
    if(uurl.indexOf("http://") != 0)
      uurl = "http://" + uurl;

    values["format-" + media] = uurl;
    newMediaurls.push(
      {
        media: media,
        url: uurl
      }
    );
  }

  values = JSON.stringify(values);
  values = encodeURIComponent(values);

  async.series(
    [
      // check doc name
      function (cb)
      {
        if(!/^[a-z][0-9a-z_-]{5,}$/i.test(docname))
          cb("docname");
        else
          cb();
      },
      // check media urls
      function (cb)
      {
        async.each(newMediaurls,
          function (mediaUrl, cb)
          {
            var parsedUrl = url.parse(mediaUrl.url);

            checkMediaFileUrl(parsedUrl,
              function (err, result)
              {
                if(result.result == "ok")
                  useableMediaurls.push(mediaUrl);

                cb();
              }
            );
          },
          cb
        );
      },
      // create doc
      function (cb)
      {
        if(useableMediaurls.length == 0)
          return cb("media");

        server.db.doc.createDoc(docname, "asyncnoter", "pod", cb);
      },
      // set media urls
      function (cb)
      {
        var docChanges =
        {
          docname: docname,
          async:
          {
            mediaurls: {}
          }
        };

        for (var i in useableMediaurls)
        {
          var name = useableMediaurls[i].media;

          docChanges.async.mediaurls[name] =
          {
            url: useableMediaurls[i].url
          }
        }

        server.db.doc.updateDoc(docChanges, cb);
      },
      // get the finished doc
      function (cb)
      {
        server.db.doc.getDoc(docname,
          function (err, _doc)
          {
            doc = _doc;
            cb(err);
          }
        );
      },
      // create doc in asyncnoter
      function (cb)
      {
        server.documentTypes.onCreateDoc(doc, cb);
      }
    ],
    function (err)
    {
      if(err)
      {
        var userError = "other";

        if(err == "media" || err == "docname" || err == "docexists")
          userError = err;

        console.log("Error while creating asyncdoc: " + err);

        res.redirect("/createasync?error=" + userError + "&values=" + values)
      }
      else
      {
        res.redirect("/doc/" + docname);
      }
    }
  )
}

function getCreateAsyncCheckStatus(req, res)
{
  if(!canCreateDoc(res.locals.user) || !req.query.url)
    return res.end();

  var uurl = req.query.url;
  if(uurl.indexOf("http://") != 0)
    uurl = "http://" + uurl;
  var fileUrl = url.parse(uurl);

  console.log("Requesting %s//%s%s for %s", fileUrl.protocol, fileUrl.host, fileUrl.pathname, res.locals.user.username);

  checkMediaFileUrl(fileUrl,
    function (err, status)
    {
      res.json(status);
    }
  )
}

function checkMediaFileUrl(url, cb)
{
  if(!url.protocol || !url.hostname || url.hostname.indexOf('.') == -1)
    return cb(null, { result: "error" });

  var options =
  {
    hostname: url.hostname,
    port: 80,
    path: url.pathname,
    method: 'HEAD',
    agent: false // => `Connection: close`
  };

  var fileReq = http.request(options, function(fileRes)
  {
    var code = fileRes.statusCode;
    var text = HTTPStatus[code];
    var result = "ok";

    if(code < 200 || code >= 500 || code == 404)
      result = "error";

    cb(null,
      {
        result: result,
        statusCode: code,
        statusText: text,
        headerLocation: fileRes.headers.location
      }
    );
  });

  fileReq.on('error', function(e)
  {
    cb(null, { result: "error" });
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
  if(op.oi && op.od && Object.keys(op).length == 3)
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
    authtoken: token,
    mediaurls: doc.async.mediaurls,
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
  var minutes = pad(Math.floor((time / 60) % 60), 2);
  var hours = pad(Math.floor((time / 60 / 60) % 60), 2);

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
