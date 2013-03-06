var client
  , async  = require('async')
  , util   = require('util')
  , crypto = require('crypto');

exports.init = function (_client, _cb)
{
  client =_client;
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
        client.set("doc:" + docname, JSON.stringify(doc));
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
  client.get("doc:" + docname, function (err, doc)
    {
      if(!doc)
      {
        cb("nodoc", null);
      }
      else
      {
        if(!err)
          doc = JSON.parse(doc);
        cb(err, doc);
      }
    });
}

exports.getDocs = function (cb)
{
  async.waterfall([
      // get all doc-names
      function (_cb)
      {
        client.keys('doc:*', _cb);
      },
      // get all docs
      function (_docs, _cb)
      {
        var multi = client.multi();
        for(var id in _docs)
        {
          multi.get(_docs[id]);
        }
        multi.exec(_cb);
      },
      // parse all docs
      function (_docs, _cb)
      {
        for(var id in _docs)
        {
          _docs[id] = JSON.parse(_users[id]);
        }
        _cb(null, _docs);
      }
    ], cb);
}
