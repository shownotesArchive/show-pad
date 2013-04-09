var async  = require('async')
  , eplapi = require('etherpad-lite-client');

var server     = null
  , etherpad   = null
  , eplurl     = ""
  , eplGroupIDs = {}
  , sessionMaxAge = 86400000;

exports.name = "etherpad";

/* Init */
exports.init = function (_server, cb)
{
  server = _server;
  var usernames = null;

  async.waterfall(
    [
      // connect to epl
      function (cb)
      {
        var conf = server.nconf.get('etherpad');
        eplurl = "http://" + conf.host + ":" + conf.port;
        etherpad = eplapi.connect(conf);
        etherpad.checkToken({},
          function (err) { cb(err ? "Etherpad: " + err.message: null); });
      },
      // get all showpad-groups
      function (cb)
      {
        server.db.group.getGroups(cb);
      },
      // create the corresponding epl-groups
      function (groups, cb)
      {
        async.each(groups, exports.onCreateGroup, cb);
      },
      // get all user-names
      function (cb)
      {
        server.db.getObjectsOfType("user", cb);
      },
      // get all session-ids
      function (names, cb)
      {
        usernames = names;
        async.map(names,
          function (name, cb)
          {
            cb(null, "user:" + name + ":eplSessions");
          },
          function (err, keys)
          {
            server.db.getManyValues(keys, cb);
          });
      },
      // delete all existing sessions
      function (sessions, cb)
      {
        var sessionKeys = Object.keys(sessions);

        if(sessionKeys.length == 0)
          return cb("nosessions");

        async.concat(sessionKeys,
          function (sessionKey, cb)
          {
            cb(null, sessions[sessionKey]);
          },
          function (er, sessions)
          {
            console.log("Removing %s old sessions..", sessions.length);
            async.each(sessions,
              function (session, cb)
              {
                etherpad.deleteSession({sessionID: session}, function () { cb(); });
              }, cb);
          });
      },
      // remove sessions from db
      function (cb)
      {
        async.each(usernames,
          function (username, cb)
          {
            var changes = { username: username, eplSessions: null };
            server.db.user.updateUser(changes, cb);
          }, cb);
      }
    ],
    function (err)
    {
      if(err == "nosessions")
        err = null;
      cb(err);
    }
  );
}

exports.initExpress = function (app)
{
  // do nothing
}

/* Users */
exports.onLogin = function (user, res, cb)
{
  var authorID, sessionIDs = [], groups;

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
              console.debug("[epl] [%s] AuthorID: %s", user.username, authorID);
            }
            cb(err);
          });
      },
      // get all groups
      function (cb)
      {
        server.db.group.getGroups(
          function (err, _groups)
          {
            if(!err)
              groups = _groups;
            cb(err);
          }
        );
      },
      // create sessions for all groups of this user and all open groups
      function (cb)
      {
        var sessionGroups = [];

        for (var id in groups)
        {
          if(groups[id].type == "open")
          {
            sessionGroups.push(groups[id].short);
          }
        }

        sessionGroups = sessionGroups.concat(user.groups);

        async.each(sessionGroups,
          function (showGroup, cb)
          {
            etherpad.createSession(
              {
                authorID: authorID,
                groupID: eplGroupIDs[showGroup],
                validUntil: new Date().getTime() + sessionMaxAge
              },
              function (err, data)
              {
                if(!err)
                {
                  sessionIDs.push(data.sessionID);
                  console.debug("[epl] [%s] %s (%s) SessionID: %s", user.username, showGroup, eplGroupIDs[showGroup], data.sessionID);
                }
                cb(err);
              });
          }, cb);
      },
      // save session and set cookie
      function (cb)
      {
        var cookieStr = "";
        for (var id in sessionIDs)
        {
          cookieStr += sessionIDs[id] + ',';
        }
        cookieStr = cookieStr.substr(0, cookieStr.length - 1);

        if(!user.eplSessions)
          user.eplSessions = [];

        var userChanges = { username: user.username, eplSessions: sessionIDs.concat(user.eplSessions) };
        server.db.user.updateUser(userChanges,
          function (err)
          {
            if(err)
            {
              console.debug("[epl] [%s] Login failed", user.username);
            }
            else
            {
              res.cookie("sessionID", cookieStr, { maxAge: sessionMaxAge, httpOnly: false});
              console.debug("[epl] [%s] Logged in", user.username);
            }

            cb(err);
          });
      }
    ], cb);
}

exports.onCreateUser = function (user, cb)
{
  // do nothing
  cb();
}

exports.onLogout = function (user, res, cb)
{
  var sessions = user.eplSessions;
  var username = user.username;

  if(!sessions || sessions.length == 0)
  {
    // no need to stress the db and etherpad
    console.warn("[epl] [%s] has no sessions", username);
    return cb();
  }

  async.series(
    [
      // delete epl sessions
      function (cb)
      {
        async.each(sessions,
          function (sid, cb)
          {
            etherpad.deleteSession({sessionID: sid},
              function (err)
              {
                if(err)
                  console.error("[epl] [%s] could not delete session", username, sid, err);
                else
                  console.debug("[epl] [%s] session deleted", username, sid);
                cb();
              });
          }, cb);
      },
      // remove sessions from db
      function (cb)
      {
        var userChanges = { username: user.username, eplSessions: [] };
        server.db.user.updateUser(userChanges,
          function (err)
          {
            if(err)
              console.debug("[epl] [%s] Could not remove sessions from db", username);
            else
              console.debug("[epl] [%s] Sessions removed from db", username);
            cb(err);
          });
      }
    ], cb
  );
}

/* Groups */
exports.onCreateGroup = function (group, cb)
{
  etherpad.createGroupIfNotExistsFor(
    {
      groupMapper: "showpad_" + group.short
    },
    function (err, data)
    {
      if(!err)
      {
        eplGroupIDs[group.short] = data.groupID;
        console.debug("[epl] groupid for %s is %s", group.short, data.groupID);
      }
      cb(err);
    }
  );
}

/* Docs */
exports.onCreateDoc = function (doc, cb)
{
  var groupID = eplGroupIDs[doc.group];
  var padName = doc.docname;

  etherpad.createGroupPad({ groupID: groupID, padName: padName }, cb);
}

exports.onDeleteDoc = function (doc, cb)
{
  var docname = doc.docname;
  var groupID = eplGroupIDs[doc.group];

  etherpad.deletePad({padID: groupID + "$" + docname},
    function (err)
    {
      if(err)
        console.error("[epl] could not delete pad: %s, %s", docname, err);
      else
        console.debug("[epl] pad deleted:", docname);
      cb(err);
    });
}

exports.onRequestDoc = function (req, res, user, doc, cb)
{
  var locals =
    {
      docname: doc.name,
      groupID: eplGroupIDs[doc.group],
      eplurl: eplurl,
      padId: req.params.docname
    };

  res.render('documenttypes/etherpad.ejs', locals);
  cb();
}

/* Pad text */
exports.setText = function (doc, text, cb)
{
  var groupID = eplGroupIDs[doc.group];
  var docname = doc.docname;

  etherpad.setText({padID: groupID + "$" + docname, text: text},
    function (err)
    {
      if(err)
        console.error("[epl] could not set pad-text: %s, %s", docname, err);
      else
        console.debug("[epl] pad-text set:", docname);
      cb(err);
    });
}

exports.getText = function (doc, cb)
{
  var groupID = eplGroupIDs[doc.group];
  var docname = doc.docname;

  etherpad.getText({padID: groupID + "$" + docname},
    function (err, data)
    {
      if(err)
        console.error("[epl] could not get pad-text: %s, %s", docname, err);
      else
        console.debug("[epl] got pad-text:", docname);
      cb(err, data);
    });
}

/* other */
exports.getLastModifed = function (doc, cb)
{
  var groupID = eplGroupIDs[doc.group];
  var docname = doc.docname;

  etherpad.getLastEdited({padID: groupID + "$" + docname},
    function (err, data)
    {
      if(err)
        console.error("[epl] could not get pad-lastEdited: %s, %s", docname, err);
      else
        console.debug("[epl] got pad-lastEdited:", docname);
      cb(err, data);
    });
}
