var async  = require('async')
  , fs    = require('fs')
  , pluginloader = require('./pluginloader.js')
  , apikey = null
  , server
  , db;

var endpoints = {};

exports.init = function (_server, _cb)
{
  server = _server;
  db = server.db;

  var tmpapikeyey = server.nconf.get("apikey");
  if(tmpapikeyey && tmpapikeyey.length != 0)
  {
    if(tmpapikeyey.length < 30)
    {
      console.warn("Your API-Key is too short. Please use at least 30 characters.");
    }
    else
    {
      console.log("API-Key is '%s'", tmpapikeyey);
      apikey = tmpapikeyey;
    }
  }
  else
  {
    console.warn("No API-Key defined.");
  }

  pluginloader.load('./src/api', [db, server],
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


  var apikeyValid = apikey != null && query["apikey"] == apikey;
  var adminValid = !!user && user.hasRole("admin");

  if(!apikeyValid && !adminValid)
  {
    var username = "none"
    if(user)
      username = user.username;

    console.warn("API-Auth failed, APIKey=%s, Admin=%s (%s)", apikeyValid, adminValid, username);
    answerRequest(res, 401, "Unauthorized", null);
    return;
  }
  else
  {
    var auth = "";
    if(apikeyValid)
      auth = "apikey";
    else if(adminValid)
      auth = "user=" + user.username;

    console.info("[API] REQUEST auth=%s %s %s", auth, method, req.url);
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
