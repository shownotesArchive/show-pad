var async = require('async');

var db, server;

exports.name = "template";

exports.init = function (_db, _server, cb)
{
  server = _server;
  db = _db;
  cb();
}

exports.getOne = function (res, req, answerRequest)
{
  answerRequest(res, 405, "Method Not Allowed", null);
}

exports.getMany = function (res, req, answerRequest)
{
  db.template.getRawTemplate(
    function (err, tpl)
    {
      if(err)
        answerRequest(res, 500, err, null);
      else
        answerRequest(res, 200, "ok", tpl);
    }
  );
}

exports.createOne = function (res, req, answerRequest)
{
  var tpl = req.body;
  if(!tpl || !tpl.text)
  {
    answerRequest(res, 400, "Missing text.", null);
  }
  else
  {
    db.template.saveRawTemplate(tpl);
    answerRequest(res, 200, "ok", null);
  }
}

exports.updateOne = function (res, req, answerRequest)
{
  answerRequest(res, 405, "Method Not Allowed", null);
}

exports.deleteOne = function (res, req, answerRequest)
{
  answerRequest(res, 405, "Method Not Allowed", null);
}
