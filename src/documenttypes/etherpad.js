var async  = require('async')
  , eplapi = require('etherpad-lite-client');

var server
  , etherpad = null
  , eplurl   = ""
  , groupID  = null;

exports.name = "etherpad";

exports.init = function (_server, cb)
{
  server = _server;

  console.info("Initiating etherpad..");
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
              console.debug("our groupid is " + eplGroupID);
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
            console.error("Error whole deleting sessions: ");
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
              console.debug("deleting " + sessionIds.length + " old sessions..");
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
  var authorID, groupID, sessionID;

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
            validUntil: new Date().getTime() + 86400000
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
        user.eplSession = sessionID;
        server.db.user.updateUser(user);
        res.cookie("sessionID", sessionID, { maxAge: 900000, httpOnly: false});
        console.debug("[epl] [" + user.username + "] Logged in");
        cb();
      }
    ], cb);
}

exports.onRegister = function (user, cb)
{
  // do nothing
}

exports.onLogout = function (req, res, cb)
{
  // delete epl session
  if(res.locals.user)
  {
    var sid = res.locals.user.eplSession;
    etherpad.deleteSession({sessionID: sid},
      function (err, data)
      {
        if(err)
          console.error("[" + username + "] could not delete epl-session: " + sid);
        else
          console.debug("[" + username + "] epl-session deleted: " + sid);
        cb();
      });
  }
}
