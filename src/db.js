var redis  = require('redis')
  , async  = require('async')
  , userdb = require('./userdb.js')
  , options
  , client;

exports.user = userdb;

exports.init = function (_options, cb)
{
  options = _options;
  async.series([
    initRedis,
    function ()
    {
      userdb.init(client, cb);
    }
  ]);
}

exports.quit = function (cb)
{
  client.quit(cb);
}

exports.getClient = function ()
{
  return client;
}

function initRedis(cb)
{
  client = redis.createClient(options.socket);

  client.on("connect", function ()
    {
      cb(null);
    });

  client.on("error", function (err)
    {
      console.error(err);
      process.exit(1);
    });
}
