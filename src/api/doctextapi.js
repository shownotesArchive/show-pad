var async = require('async');

var db
  , server;

exports.name = "doctexts";

exports.init = function (_db, _server, cb)
{
  db = _db;
  server = _server;
  cb();
}

exports.getOne = function (res, req, answerRequest)
{
  var docname = req.params.entity;

  db.doc.getDoc(docname,
    function (err, doc)
    {
      if(err == "nodoc")
      {
        answerRequest(res, 404, "Doc not found", null);
      }
      else if(err)
      {
        answerRequest(res, 500, err, null);
      }
      else
      {
        server.documentTypes.getText(doc,
          function (err, text)
          {
            if(err)
              answerRequest(res, 500, err, null);
            else
              answerRequest(res, 200, "ok", text);
          });
      }
    });
}

exports.getMany = function (res, req, answerRequest)
{
  async.waterfall(
    [
      // get all docs
      server.db.doc.getDocs,
      // get doc-texts
      function (docs, cb)
      {
        async.map(docs,
          function (doc, cb)
          {
            server.documentTypes.getText(doc,
              function (err, text)
              {
                if(err)
                  cb(null, { name: doc.docname, error: err, text: null });
                else
                  cb(null, { name: doc.docname, error: null, text: text });
              });
          }, cb
        );
      }
    ],
    // return doc-texts to client
    function (err, docs)
    {
      if(err)
        answerRequest(res, 500, err, null);
      else
        answerRequest(res, 200, "ok", docs);
    }
  );
}

exports.createOne = function (res, req, answerRequest)
{
  answerRequest(res, 405, "Method Not Allowed", null);
}

exports.updateOne = function (res, req, answerRequest)
{
  var text = req.body;
  var docname = req.params.entity;

  db.doc.getDoc(docname,
    function (err, doc)
    {
      if(err == "nodoc")
      {
        answerRequest(res, 404, "Doc not found", null);
      }
      else if(err)
      {
        answerRequest(res, 500, err, null);
      }
      else
      {
        server.documentTypes.setText(doc, text,
          function (err)
          {
            if(err)
              answerRequest(res, 500, err, null);
            else
              answerRequest(res, 200, "ok", null);
          });
      }
    });
}

exports.deleteOne = function (res, req, answerRequest)
{
  answerRequest(res, 405, "Method Not Allowed", null);
}
