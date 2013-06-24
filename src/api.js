var async  = require('async')
  , fs    = require('fs')
  , pluginloader = require('./pluginloader.js')
  , apikeys = []
  , server
  , logger
  , db;

var endpoints = {};

exports.init = function (_server, _cb)
{
  server = _server;
  logger = server.getLogger("api");
  db = server.db;

  var tmpapikeys = server.nconf.get("apikeys");

  for (var i = 0; i < tmpapikeys.length; i++)
  {
    var apikey = tmpapikeys[i];

    if(!apikey || !apikey.key || !apikey.name)
    {
      logger.warn("API-Key-Setting %s is invalid. Please supply an name and key.", i);
    }
    if(apikey.key.length < 30)
    {
      logger.warn("API-Key for %s is too short. Please use at least 30 characters.", apikey.name);
    }
    else
    {
      logger.info("API-Key of %s is %s", apikey.name, apikey.key);
      apikeys.push(apikey);
    }
  }

  pluginloader.load('./src/api', [db, server], logger,
    function (err, plugins)
    {
      if(err) return cb("Could not load api: " + err);

      endpoints = plugins;
      _cb();
    }
  );
}

/* see /doc/api.md for details */
exports.handleRequest = function (req, res)
{
  var method = req.method
    , params = req.params
    , query  = req.query;

  var user = res.locals.user;

  var apikeyName = checkAPIKey(query["apikey"]);
  var apikeyValid = !!apikeyName;
  var adminValid = !!user && user.hasRole("admin");

  if(!apikeyValid && !adminValid)
  {
    var username = "none"
    if(user)
      username = user.username;

    logger.warn("API-Auth failed, APIKey=%s, Admin=%s (%s)", apikeyValid, adminValid, username);
    answerRequest(res, 401, "Unauthorized", null);
    return;
  }
  else
  {
    var auth = "";
    if(apikeyValid)
      auth = "apikey=" + apikeyName;
    else if(adminValid)
      auth = "user=" + user.username;

    logger.info("[API] REQUEST auth=%s %s %s", auth, method, req.url);
  }

  var endpoint = endpoints[params.endpoint];

  if(!endpoint)
  {
    answerRequest(res, 400, "Endpoint does not exist.", null);
    return;
  }

  var entityGiven = params.entity;

  if(method == "GET") // read
  {
    if(entityGiven)
      endpoint.getOne(res, req, answerRequest);
    else
      endpoint.getMany(res, req, answerRequest);
  }
  else if(method == "POST") // create
  {
    if(entityGiven)
      answerRequest(res, 405, "Method Not Allowed", null); // error
    else
      endpoint.createOne(res, req, answerRequest);
  }
  else if(method == "PUT") // update
  {
    if(entityGiven)
      endpoint.updateOne(res, req, answerRequest);
    else
      answerRequest(res, 405, "Method Not Allowed", null); // TODO, bulk update
  }
  else if(method == "DELETE") // remove
  {
    if(entityGiven)
      endpoint.deleteOne(res, req, answerRequest);
    else
      answerRequest(res, 405, "Method Not Allowed", null); // would be delete all
  }
}

function checkAPIKey(apikey)
{
  if(!apikey || typeof apikey != "string")
  {
    return null;
  }

  for (var i = 0; i < apikeys.length; i++)
  {
    if(apikeys[i].key == apikey)
    {
      return apikeys[i].name;
    }
  }

  return null;
}

function answerRequest(res, statusCode, msg, data)
{
  console.info("[API] RESPONSE %s: %s", statusCode, msg);

  var response =
    {
      status: statusCode,
      message: msg,
      data: data
    };

  res.json(statusCode, response);
}
