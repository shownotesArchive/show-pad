var async     = require('async')
  , fs        = require('fs');

var server,
    documentTypes = {};

exports.documentTypes = documentTypes;

/* Init */
exports.init = function (_server, cb)
{
  server = _server;

  fs.readdir('./src/documenttypes', function (err, files)
  {
    if(err)
    {
      console.error("Could not load doctypes: " + err);
      cb();
      return;
    }

    console.debug("Found " + files.length + " doctypes!");

    async.eachSeries(files,
      function (file, cb)
      {
        var t = require('./documenttypes/' + file);
        documentTypes[t.name] = t;
        console.debug("Initiating " + t.name + "...");
        documentTypes[t.name].init(_server, cb);
      }, cb);
  });
}

exports.onExpressInit = function (app)
{
  for(var t in documentTypes)
  {
    console.debug("Initiating " + documentTypes[t].name + "...");
    documentTypes[t].initExpress(app);
  }
}

/* Users */
exports.onLogin = function (user, res, cb)
{
  async.eachSeries(Object.keys(documentTypes),
    function (type, cb)
    {
      type = documentTypes[type];
      console.debug("[" + user.username + "] starting " + type.name + "-login");
      type.onLogin(user, res, cb);
    }, cb);
}

exports.onLogout = function (user, res, cb)
{
  async.eachSeries(Object.keys(documentTypes),
    function (type, cb)
    {
      type = documentTypes[type];
      console.debug("[" + user.username + "] starting " + type.name + "-logout");
      type.onLogout(user, res, cb);
    }, cb);
}

exports.onCreateUser = function (user, cb)
{
  async.eachSeries(Object.keys(documentTypes),
    function (type, cb)
    {
      type = documentTypes[type];
      console.debug("[" + user.username + "] starting " + type.name + "-register");
      type.onCreateUser(username, cb);
    }, cb);
}

/* Groups */
exports.onCreateGroup = function (group, cb)
{
  async.eachSeries(Object.keys(documentTypes),
    function (type, cb)
    {
      type = documentTypes[type];
      type.onCreateGroup(group, cb);
    }, cb);
}

/* Docs */
exports.onCreateDoc = function (doc, cb)
{
  var doctype = documentTypes[doc.type];

  if(!doctype)
    cb("nodoctype");
  else
    doctype.onCreateDoc(doc, cb);
}

exports.onDeleteDoc = function (doc, cb)
{
  var doctype = documentTypes[doc.type];

  if(!doctype)
    cb("nodoctype");
  else
    doctype.onDeleteDoc(doc, cb);
}

exports.onRequestDoc = function (req, res, user, doc, cb)
{
  var doctype = documentTypes[doc.type];

  if(!doctype)
    cb("nodoctype");
  else
    doctype.onRequestDoc(req, res, user, doc, cb);
}
