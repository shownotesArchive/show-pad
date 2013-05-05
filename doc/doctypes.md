Document-Types
==============

```javascript
var server = null
  , logger = null

exports.name = "";

/* Init */
exports.init = function (_server, cb)
{
  server = _server;
  logger = server.getLogger(exports.name);
  cb();
}

exports.initExpress = function (app)
{
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
```
