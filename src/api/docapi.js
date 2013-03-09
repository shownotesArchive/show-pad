var db
  , server;

exports.name = "docs";

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
        answerRequest(res, 200, "ok", doc);
      }
    });
}

exports.getMany = function (res, req, answerRequest)
{
  db.doc.getDocs(function (err, docs)
  {
    if(err)
    {
      answerRequest(res, 500, err);
    }
    else
    {
      if(req.query["datatables"])
      {
        for(var id in docs)
        {
          docs[id].DT_RowId = docs[id].docname;
        }
      }

      answerRequest(res, 200, "ok", docs);
    }
  });
}

exports.createOne = function (res, req, answerRequest)
{
  var doc = req.body;
  var missing = [];

  if(!doc.docname)
    missing.push("docname");
  if(!doc.type)
    missing.push("type");

  if(missing.length != 0)
  {
    answerRequest(res, 400, "Missing values, see data.", missing);
    return;
  }

  db.doc.createDoc(doc.docname, doc.type, function (err)
    {
      if(err)
      {
        answerRequest(res, 500, err, null);
      }
      else
      {
        server.documentTypes[doc.type].onCreateDoc(doc.docname,
          function (err)
          {
            if(err)
              answerRequest(res, 500, err, null);
            else
              answerRequest(res, 200, "ok", doc);
          });
      }
    });
}

exports.updateOne = function (res, req, answerRequest)
{
  var doc = req.body;
  doc.docname = req.params.entity;

  db.doc.updateDoc(doc,
    function (err)
    {
      if(err)
        answerRequest(res, 500, err, null);
      else
        answerRequest(res, 200, "ok", null);
    });
}

exports.deleteOne = function (res, req, answerRequest)
{
  var docname = req.params.entity;
  db.doc.deleteDoc(docname,
    function (err)
    {
      if(err)
        answerRequest(res, 500, err, null);
      else
        answerRequest(res, 200, "ok", null);
    })
}
