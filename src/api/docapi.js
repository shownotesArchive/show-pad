var db
  , server;

exports.name = "docs";

exports.init = function (_db, _server, cb)
{
  db = _db;
  server = _server;
  cb();
}

exports.getOne = function (res, params, query, answerRequest)
{
  var docname = params.entity;

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

exports.getMany = function (res, params, query, answerRequest)
{
  db.doc.getDocs(function (err, docs)
  {
    if(err)
    {
      answerRequest(res, 500, err);
    }
    else
    {
      for(var id in docs)
      {
        if(query["datatables"])
          docs[id].DT_RowId = docs[id].docname;
      }

      answerRequest(res, 200, "ok", docs);
    }
  });
}

exports.setOneDT = function (body, res, params, query, answerRequest)
{
  // do nothing
}

exports.createOne = function (body, res, params, query, answerRequest)
{
  var doc = body;

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