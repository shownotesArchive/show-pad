var async  = require('async')
  , eplapi = require('etherpad-lite-client');

var server     = null
  , etherpad   = null
  , eplurl     = ""
  , eplGroupID = null
  , sessionMaxAge = 86400000;

exports.name = "etherpad";

exports.init = function (_server, cb)
{
  server = _server;

  async.series(
    [
      // connect to epl
      function (cb)
      {
        var conf = server.nconf.get('etherpad');
        eplurl = "http://" + conf.host + ":" + conf.port;
        etherpad = eplapi.connect(conf);
        cb();
      },
      // create the group
      function (cb)
      {
        etherpad.createGroupIfNotExistsFor(
          {
            groupMapper: "showpad"
          },
          function (err, data)
          {
            if(!err)
            {
              eplGroupID = data.groupID;
              console.debug("[epl] our groupid is " + eplGroupID);
            }
            cb(err);
          }
        );
      },
      // delete all existing sessions in this group
      function (cb)
      {
        etherpad.listSessionsOfGroup(
        {
          groupID: eplGroupID
        },
        function (err, data)
        {
          if(err)
          {
            console.error("Error while deleting sessions: ");
            console.error(err)
            process.exit(1);
          }
          else
          {
            if(data == null)
            {
              cb();
            }
            else
            {
              var sessionIds = Object.keys(data);
              console.debug("[epl] deleting " + sessionIds.length + " old sessions..");
              async.forEach(
                sessionIds,
                function(item, done)
                {
                  etherpad.deleteSession({sessionID:item}, done);
                },
                function(err)
                {
                  cb(err);
                }
              );
            }
          }
        });
      }
    ], cb);
}

exports.initExpress = function (app)
{
  // do nothing
}

exports.onLogin = function (user, req, res, cb)
{
  var authorID, sessionID;

  async.series(
    [
      // create author
      function (cb)
      {
        etherpad.createAuthorIfNotExistsFor(
          {
            name: user.username,
            authorMapper: user.username
          },
          function (err, data)
          {
            if(!err)
            {
              authorID = data.authorID;
              console.debug("[epl] [" + user.username + "] AuthorID: " + authorID);
            }
            cb(err);
          });
      },
      // create session
      function (cb)
      {
        etherpad.createSession(
          {
            authorID: authorID,
            groupID: eplGroupID,
            validUntil: new Date().getTime() + sessionMaxAge
          },
          function (err, data)
          {
            if(!err)
            {
              sessionID = data.sessionID;
              console.debug("[epl] [" + user.username + "] SessionID: " + sessionID);
            }
            cb(err);
          });
      },
      // save session and set cookie
      function (cb)
      {
        var userChanges = { username: user.username, eplSession: sessionID };
        server.db.user.updateUser(userChanges,
          function (err)
          {
            if(err)
            {
              console.debug("[epl] [" + user.username + "] Login failed");
            }
            else
            {
              res.cookie("sessionID", sessionID, { maxAge: sessionMaxAge, httpOnly: false});
              console.debug("[epl] [" + user.username + "] Logged in");
            }

            cb(err);
          });
      }
    ], cb);
}

exports.onRegister = function (username, cb)
{
  // do nothing
  cb();
}

exports.onLogout = function (user, req, res, cb)
{
  // delete epl session
  var sid = user.eplSession;
  var username = user.username;

  if(sid)
  {
    etherpad.deleteSession({sessionID: sid},
      function (err, data)
      {
        if(err)
          console.error("[epl] [" + username + "] could not delete session: " + sid + ", " + err);
        else
          console.debug("[epl] [" + username + "] session deleted: " + sid);
        cb();
      });
  }
}

exports.onCreateDoc = function (docname, cb)
{
  etherpad.createGroupPad({ groupID: eplGroupID, padName: docname }, cb);
}

exports.onDeleteDoc = function (docname, cb)
{
  etherpad.deletePad({padID: eplGroupID + "$" + docname},
    function (err)
    {
      if(err)
        console.error("[epl] could not delete pad: " + docname + ", " + err);
      else
        console.debug("[epl] pad deleted: " + docname);
      cb(err);
    });
}

exports.onRequestDoc = function (req, res, user, doc, cb)
{
  var locals =
    {
      docname: doc.name,
      groupID: eplGroupID,
      eplurl: eplurl,
      padId: req.params.docname
    };

  res.render('documenttypes/etherpad.ejs', locals);
  cb();
}
