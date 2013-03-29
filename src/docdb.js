var db
  , async  = require('async')
  , util   = require('util')
  , crypto = require('crypto');

function Doc (docname, type)
{
  if(!docname || !type)
    throw "Invalid arguments";
  this.docname = docname;
  this.type = type;
}

Doc.prototype =
{
  constructor: Doc,
  fromRawData: function (rawDoc)
  {
    for (var prop in rawDoc)
    {
      this[prop] = rawDoc[prop];
    }
  }
}

exports.init = function (_db, _cb)
{
  db = _db;
  _cb(null);
}

exports.createDoc = function (docname, type, cb)
{
  var doc = new Doc(docname, type);

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
        var objDoc = new Doc(doc.docname, doc.type);
        objDoc.fromRawData(doc);
        cb(err, objDoc);
      }
    });
}

exports.getDocs = function (cb)
{
  db.getMany('doc',
    function (err, docs)
    {
      if(docs)
      {
        for (var id in docs)
        {
          var objDoc = new Doc(docs[id].docname, docs[id].type);
          objDoc.fromRawData(docs[id]);
          docs[id] = objDoc;
        }
      }
      cb(err, docs);
    });
}

exports.updateDoc = function (docChanges, cb)
{
  var docname = docChanges.docname;

  async.waterfall(
    [
      // get the current doc
      function (cb)
      {
        exports.getDoc(docname, cb);
      },
      // apply changes
      function (doc, cb)
      {
        if(!doc)
        {
          cb("nodoc");
        }
        else
        {
          for(var prop in docChanges)
          {
            doc[prop] = docChanges[prop];
          }
          cb(null, doc);
        }
      },
      // update the doc
      function (doc, cb)
      {
        db.set("doc:" + docname, doc);
        cb();
      }
    ], cb);
}

exports.deleteDoc = function (docname, cb)
{
  db.del("doc:" + docname, cb);
}

exports.docExists = function (docname, cb)
{
  db.objExists("doc:" + docname, cb);
}
