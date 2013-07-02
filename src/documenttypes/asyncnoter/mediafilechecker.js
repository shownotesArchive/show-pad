var http = require('http')
  , HTTPStatus = require('http-status')

exports.name = "async-mediafilechecker";

var asyncnoter
  , server
  , logger

exports.init = function (_asyncnoter, _server, _logger, cb)
{
  asyncnoter = _asyncnoter;
  server = _server;
  logger = _logger;

  cb();
}

exports.checkMediaFileUrl = function (url, cb)
{
  if(!url.protocol || !url.hostname || url.hostname.indexOf('.') == -1)
    return cb(null, { result: "error" });

  var options =
  {
    hostname: url.hostname,
    port: 80,
    path: url.pathname,
    method: 'HEAD',
    agent: false // => `Connection: close`
  };

  var fileReq = http.request(options, function(fileRes)
  {
    var code = fileRes.statusCode;
    var text = HTTPStatus[code];
    var result = "ok";

    if(code < 200 || code >= 500 || code == 404)
      result = "error";

    cb(null,
      {
        result: result,
        statusCode: code,
        statusText: text,
        headerLocation: fileRes.headers.location,
        headerContentType: fileRes.headers["content-type"].split(';')[0]
      }
    );
  });

  fileReq.on('error', function(e)
  {
    cb(null, { result: "error" });
  });

  fileReq.end();
}
