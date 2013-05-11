var async  = require('async')
  , express = require('express')
  , path = require('path')
  , sharejs = require('share').server

var server = null
  , logger = null

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
      db: {type: 'none'},
      browserChannel:
      {
        base: "/sharejs/sock_bc",
        cors: '*'
      },
      rest:
      {
        base: "/sharejs/rest"
      },
      db: { type: 'none' }
    };

  sharejs.attach(app, options);
  app.use("/sharejs/channel", express.static(path.resolve(__dirname + '/../../node_modules/share/node_modules/browserchannel/dist')));
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
  cb();
}

exports.onDeleteDoc = function (doc, cb)
{
  cb();
}

exports.onRequestDoc = function (req, res, user, doc, cb)
{
  var locals =
  {
    docname: doc.docname,
    groupname: doc.group
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
  cb();
}

/* other */
exports.getLastModifed = function (doc, cb)
{
  cb();
}
