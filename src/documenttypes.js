var async     = require('async')
  , fs        = require('fs')
  , pluginloader = require('./pluginloader.js')

var server
  , logger
  , documentTypes = {};

exports.documentTypes = documentTypes;

/* Init */
exports.init = function (_server, cb)
{
  server = _server;
  logger = server.getLogger("doctypes");

  pluginloader.load('./src/documenttypes', [server], logger,
    function (err, plugins)
    {
      if(err) return cb("Could not load doctypes: " + err);

      exports.documentTypes = documentTypes = plugins;
      cb();
    }
  );
}

exports.onExpressInit = function (app)
{
  for(var t in documentTypes)
  {
    logger.debug("Initiating %s...", documentTypes[t].name);
    documentTypes[t].initExpress(app);
  }
}

/* Users */
exports.onLogin = function (user, res, cb)
{
  logger.debug("User login '%s'", user.username);
  async.eachSeries(Object.keys(documentTypes),
    function (type, cb)
    {
      type = documentTypes[type];
      type.onLogin(user, res, cb);
    }, cb);
}

exports.onLogout = function (user, res, cb)
{
  logger.debug("User logout '%s'", user.username);
  async.eachSeries(Object.keys(documentTypes),
    function (type, cb)
    {
      type = documentTypes[type];
      type.onLogout(user, res, cb);
    }, cb);
}

exports.onCreateUser = function (user, cb)
{
  logger.debug("User register '%s'", user.username);
  async.eachSeries(Object.keys(documentTypes),
    function (type, cb)
    {
      type = documentTypes[type];
      type.onCreateUser(user, cb);
    }, cb);
}

/* Groups */
exports.onCreateGroup = function (group, cb)
{
  logger.debug("Create group '%s'", group.short);
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
  logger.debug("Create doc '%s', type=", doc.docname, doc.type);
  if(!doctype)
    cb("nodoctype");
  else
    doctype.onCreateDoc(doc, cb);
}

exports.onDeleteDoc = function (doc, cb)
{
  var doctype = documentTypes[doc.type];
  logger.debug("Delete doc '%s', type=", doc.docname, doc.type);
  if(!doctype)
    cb("nodoctype");
  else
    doctype.onDeleteDoc(doc, cb);
}

exports.onRequestDoc = function (req, res, user, doc, cb)
{
  var doctype = documentTypes[doc.type];
  logger.debug("Show doc '%s', type=", doc.docname, doc.type);
  if(!doctype)
    cb("nodoctype");
  else
    doctype.onRequestDoc(req, res, user, doc, cb);
}

/* Doc Text */
exports.getText = function (doc, cb)
{
  var doctype = documentTypes[doc.type];
  logger.debug("Get doctext '%s', type=", doc.docname, doc.type);
  if(!doctype)
    cb("nodoctype");
  else
    doctype.getText(doc, cb);
}

exports.setText = function (doc, text, cb)
{
  var doctype = documentTypes[doc.type];
  logger.debug("Set doctext '%s', type=", doc.docname, doc.type);
  if(!doctype)
    cb("nodoctype");
  else
    doctype.setText(doc, text, cb);
}

/* other */
exports.getLastModifed = function (doc, cb)
{
  var doctype = documentTypes[doc.type];
  logger.debug("Get doc last modified '%s', type=", doc.docname, doc.type);
  if(!doctype)
    cb("nodoctype");
  else
    doctype.getLastModifed(doc, cb);
}
