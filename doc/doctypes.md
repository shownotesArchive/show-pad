Document-Types
==============

ShowPad is able to handle multiple types of documents, at once. For example: document `mm106` could be of type etherpad-lite and `cre132` may exist as doctype asyncnoter.
A doctype is represented by a javascript-file in `/src/documenttypes/`. All doctypes in this directory are automatically loaded.

The basic structure of this file has to look like this:
```javascript
var server = null
  , logger = null

// name of this doctype
// is used internally
// as well as in the dashboard when creating documents.
exports.name = "";

/* Init */
// called once the doctype has been loaded
exports.init = function (_server, cb)
{
  server = _server;
  logger = server.getLogger(exports.name);
  cb();
}

// called when the server configures express (the HTTP-server)
// you can use this to provide additional files for the client
// see asyncnoter-doctype for examples.
exports.initExpress = function (app)
{
}

/* User functions */
// called when a user has sucessfully logged in, you can
// use the res-parameter to create additional cookies
exports.onLogin = function (user, res, cb)
{
  // code
  cb();
}

exports.onCreateUser = function (user, cb)
{
  // code
  cb();
}

exports.onLogout = function (user, res, cb)
{
  // code
  cb();
}

/* Group functions */
exports.onCreateGroup = function (group, cb)
{
  // code
  cb();
}

/* Document functions */
exports.onCreateDoc = function (doc, cb)
{
  // the doctype should make ensure that the document
  // has been created and is fully functional once the
  // callback is called.
  cb();
}

exports.onDeleteDoc = function (doc, cb)
{
  // code
  cb();
}

exports.onRequestDoc = function (req, res, user, doc, cb)
{
  // called when a client wants to view a document in
  // normal (read/write) mode. This is only called when
  // said user is also authorized to do this.

  // The doctype is expected to send the response to the client,
  // nothing has been sent yet, so you have to handle everything
  // yourself. You'll proably want to use templating for this, see
  // https://github.com/shownotes/show-pad/blob/master/doc/templating.md
  // for more information.

  // The most basic setup would be:
  //   res.render('documenttypes/templateName.ejs', {});
  //   cb();
  // where `{}` is a set of variables passed on into the template.
  // The `/documenttypes/`-directory is, like all templates, located in `/views/`.

  cb();
}

/* Document content */
exports.setText = function (doc, text, cb)
{
  // `text` is a string in OSF-format
  cb();
}

exports.getText = function (doc, cb)
{
  // the callback is expected to return the documents
  // current content as string in OSF-format
  cb(null, '');
}

/* other */
exports.getLastModifed = function (doc, cb)
{
  cb(null, new Date());
}
```
