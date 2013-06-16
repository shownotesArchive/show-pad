var async  = require('async')
  , eplapi = require('etherpad-lite-client');

var server     = null
  , etherpad   = null
  , eplurl     = ""
  , eplGroupIDs = {}
  , logger
  , sessionMaxAge = 86400000;

exports.name = "etherpad";

/* Init */
exports.init = function (_server, cb)
{
  server = _server;
  logger = server.getLogger('epl');
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
  // do nothing
  cb();
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
    return cb();
  }

  res.clearCookie("sessionID");

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
                  logger.error("[%s] could not delete session", username, sid, err);
                else
                  logger.debug("[%s] session deleted", username, sid);
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
              logger.debug("[%s] Could not remove sessions from db", username);
            else
              logger.debug("[%s] Sessions removed from db", username);
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
        logger.debug("Groupid for %s is %s", group.short, data.groupID);
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
        logger.error("Could not delete pad: %s, %s", docname, err);
      else
        logger.debug("Pad deleted:", docname);
      cb(err);
    });
}

exports.onRequestDoc = function (req, res, user, doc, cb)
{
  var docgroup = doc.group
    , authorID
    , sessionID
    , user = res.locals.user

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
              logger.debug("[%s] AuthorID: %s", user.username, authorID);
            }
            cb(err);
          }
        );
      },
      // create session for this pad
      function (cb)
      {
        etherpad.createSession(
          {
            authorID: authorID,
            groupID: eplGroupIDs[docgroup],
            validUntil: (new Date().getTime() + sessionMaxAge) / 1000 // seconds
          },
          function (err, data)
          {
            if(!err)
            {
              sessionID = data.sessionID;
              logger.debug("[%s] %s (%s) SessionID: %s", user.username, docgroup, eplGroupIDs[docgroup], data.sessionID);
            }
            cb(err);
          }
        );
      },
      // save new session to db and set cookie containing all sessions this user has
      function (cb)
      {
        if(!user.eplSessions)
          user.eplSessions = [];

        user.eplSessions = [sessionID].concat(user.eplSessions);

        var userChanges = { username: user.username, eplSessions: user.eplSessions };
        server.db.user.updateUser(userChanges,
          function (err)
          {
            if(err)
            {
              logger.debug("[%s] Login failed", user.username);
            }
            else
            {
              logger.debug("[%s] Logged in", user.username);

              var locals =
              {
                docname: doc.name,
                groupID: eplGroupIDs[doc.group],
                eplurl: eplurl,
                padId: req.params.docname
              };

              res.cookie("sessionID", user.eplSessions.join(','), { maxAge: sessionMaxAge, httpOnly: false }); // miliseconds
              res.render('documenttypes/etherpad.ejs', locals);
            }

            cb(err);
          }
        );
      }
    ],
    cb
  );
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
        logger.error("Could not set padtext: %s, %s", docname, err);
      else
        logger.debug("Padtext set:", docname);
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
        logger.error("Could not get padtext: %s, %s", docname, err);
      else
        logger.debug("Got padtext:", docname);

      var text = null;
      if(data && data.text)
        text = data.text;

      cb(err, text);
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
        logger.error("Could not get pad-lastEdited: %s, %s", docname, err);
      else
        logger.debug("Got pad-lastEdited:", docname);
      var date = new Date(data.lastEdited);
      cb(err, date);
    });
}
