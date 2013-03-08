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

  exports.getDoc(docname, function (err)
    {
      // we need to invert the error from getDoc..
      if(err == "nodoc")
      {
        db.set("doc:" + docname, doc);
        cb(null);
      }
      else
      {
        cb("docexists");
      }
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
