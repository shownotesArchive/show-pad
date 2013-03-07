var redis  = require('redis')
  , async  = require('async')
  , userdb = require('./userdb.js')
  , docdb  = require('./docdb.js')
  , options
  , client;

exports.user = userdb;
exports.doc = docdb;

exports.init = function (_options, cb)
{
  options = _options;
  async.series([
    initRedis,
    function (cb)
    {
      console.debug("Initiating userdb..");
      userdb.init(client, cb);
    },
    function (cb)
    {
      console.debug("Initiating docdb..");
      docdb.init(client, cb);
    }
  ], cb);
}

exports.quit = function (cb)
{
  client.quit(cb);
}

function initRedis(cb)
{
  console.debug("Initiating redis..");
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
