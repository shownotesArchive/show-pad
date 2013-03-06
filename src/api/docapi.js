var db;

exports.name = "docs";

exports.init = function (_db, cb)
{
  db = _db;
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

      var statusCode = docs.length == 0 ? 204 : 200;
      answerRequest(res, statusCode, "ok", docs);
    }
  });
}

exports.setOneDT = function (body, res, params, query, answerRequest)
{
  // do nothing
}