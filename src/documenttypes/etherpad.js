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

  async.waterfall(
    [
      // connect to epl
      function (cb)
      {
        var conf = server.nconf.get('etherpad');
        eplurl = "http://" + conf.host + ":" + conf.port;
        etherpad = eplapi.connect(conf);
        cb();
      },
      // get all showpad-groups
      function (cb)
      {
        server.db.group.getGroups(cb);
      },
      // create the corresponding epl-groups
      function (groups, cb)
      {
        async.each(groups,
          function (group, _cb)
          {
            exports.onCreateGroup(group, _cb);
          }, cb);
      },
      // delete all existing sessions
      function (cb)
      {
        async.each(Object.keys(eplGroupIDs),
          function (showGroup, cb)
          {
            deleteGroupSessions(showGroup, cb);
          }, cb);
      }
    ], cb);
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
              console.debug("[epl] [" + user.username + "] AuthorID: " + authorID);
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
                  console.debug("[epl] [" + user.username + "] " + showGroup + " (" + eplGroupIDs[showGroup] + ") SessionID: " + data.sessionID);
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

        var userChanges = { username: user.username, eplAuthor: authorID };
        server.db.user.updateUser(userChanges,
          function (err)
          {
            if(err)
            {
              console.debug("[epl] [" + user.username + "] Login failed");
            }
            else
            {
              res.cookie("sessionID", cookieStr, { maxAge: sessionMaxAge, httpOnly: false});
              console.debug("[epl] [" + user.username + "] Logged in");
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
  // delete epl session
  var aid = user.eplAuthor;
  var username = user.username;

  if(aid)
  {
    async.waterfall(
      [
        // get sessions of user
        function (_cb)
        {
          etherpad.listSessionsOfAuthor({ authorID: aid }, _cb);
        },
        // delete sessions
        function (sessions, _cb)
        {
          if(!sessions)
            sessions = [];

          async.each(sessions,
            function (session, cb)
            {
              etherpad.deleteSession({sessionID: sid},
                function (err, data)
                {
                  cb();
                });
            }, _cb);
        }
      ],
      function (err)
      {
        if(err)
          console.error("[epl] [" + username + "] could not delete session: " + err);
        else
          console.debug("[epl] [" + username + "] session deleted");
        cb();
      }
    );
  }
  else
  {
    cb();
  }
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
        console.debug("[epl] groupid for " + group.short + " is " + data.groupID);
      }
      cb(err);
    }
  );
}

function deleteGroupSessions(showGroup, cb)
{
  etherpad.listSessionsOfGroup(
    {
      groupID: eplGroupIDs[showGroup]
    },
    function (err, data)
    {
      if(err)
      {
        console.error("Error while deleting sessions of " +  + ": ");
        console.error(err)
        process.exit(1);
      }
      if(data == null)
      {
        cb();
        return;
      }

      var sessionIds = Object.keys(data);
      console.debug("[epl] deleting " + sessionIds.length + " old sessions of " + showGroup + "..");
      async.forEach(
        sessionIds,
        function(item, done)
        {
          etherpad.deleteSession({sessionID:item}, done);
        }, cb);
    });
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
        console.error("[epl] could not set pad-text: " + docname + ", " + err);
      else
        console.debug("[epl] pad-text set: " + docname);
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
        console.error("[epl] could not get pad-text: " + docname + ", " + err);
      else
        console.debug("[epl] got pad-text: " + docname);
      cb(err, data);
    });
}
