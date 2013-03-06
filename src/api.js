var async  = require('async')
  , fs    = require('fs')
  , debug = false // disabled access control
  , db;

var endpoints = {};

exports.init = function (_db, _cb)
{
  db = _db;

  fs.readdir('./src/api', function (err, files)
  {
    if(err)
    {
      console.error("Could not load api: " + err);
      cb();
      return;
    }

    console.debug("Found " + files.length + " apiendpoints!");
    async.eachSeries(files,
      function (file, cb)
      {
        var endpoint = require('./api/' + file);

        console.debug("Initiating endpoint: " + endpoint.name + "...");
        endpoints[endpoint.name] = endpoint;
        endpoints[endpoint.name].init(db, cb);
      }, _cb);
  });
}

exports.handleRequest = function (req, res)
{
  var method = req.method
    , params = req.params
    , query  = req.query;

  var user = res.locals.user;

  console.log("[API] REQUEST " + method + " " + req.url);

  if(!debug && (!user || !user.hasRole("admin")))
  {
    answerRequest(res, 401, "Unauthorized", null);
    return;
  }

  var endpoint = endpoints[params.endpoint];

  if(!endpoint)
  {
    answerRequest(res, 400, "Endpoint does not exist.", null);
    return;
  }


  if(method == "GET")
  {
    var isMany = !params.entity;

    if(isMany)
      endpoint.getMany(res, params, query, answerRequest);
    else
      endpoint.getOne(res, params, query, answerRequest);
  }
  else if(method == "POST")
  {
    if(query.datatables)
      endpoint.setOneDT(req.body, res, params, query, answerRequest);
    else
      answerRequest(res, 400, "Not supported", null)
  }
}

function answerRequest(res, statusCode, msg, data)
{
  console.log("[API] RESPONSE " + statusCode + ": " + msg);

  var response =
    {
      status: statusCode,
      message: msg,
      data: data
    };

  res.statusCode = statusCode;
  res.end(JSON.stringify(response));
}
