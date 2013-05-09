var db, server;

exports.name = "documenttypes";

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
  var types = server.documentTypes.documentTypes;
  answerRequest(res, 200, "ok", Object.keys(types));
}

exports.createOne = function (res, req, answerRequest)
{
  answerRequest(res, 405, "Method Not Allowed", null);
}

exports.updateOne = function (res, req, answerRequest)
{
  answerRequest(res, 405, "Method Not Allowed", null);
}

exports.deleteOne = function (res, req, answerRequest)
{
  answerRequest(res, 405, "Method Not Allowed", null);
}
