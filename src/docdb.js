var db
  , async  = require('async')
  , util   = require('util')
  , crypto = require('crypto');

exports.init = function (_db, _cb)
{
  db = _db;
  _cb(null);
}

exports.createDoc = function (docname, type, cb)
{
  var doc =
    {
      docname: docname,
      type: type
    };

  exports.docExists(docname, function (err, exists)
    {
      if(!exists)
      {
        db.set("doc:" + docname, doc);
      }
      cb(exists ? "docexists" : null);
    });
}

exports.getDoc = function (docname, cb)
{
  db.get("doc:" + docname, function (err, doc)
    {
      if(!doc)
      {
        cb("nodoc", null);
      }
      else
      {
        cb(err, doc);
      }
    });
}

exports.getDocs = function (cb)
{
  db.getMany('doc:*', cb);
}

exports.updateDoc = function (doc, cb)
{
  var docname = doc.docname;
  exports.docExists(docname, function (err, exists)
    {
      var error = "nodoc";
      if(exists)
      {
        db.set("doc:" + docname, doc);
        error = null;
      }
      cb(error);
    });
}

exports.deleteDoc = function (docname, cb)
{
  db.del("doc:" + docname, cb);
}

exports.docExists = function (docname, cb)
{
  db.keyExists("doc:" + docname, cb);
}
