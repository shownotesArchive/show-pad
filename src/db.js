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
      userdb.init(exports, cb);
    },
    function (cb)
    {
      console.debug("Initiating docdb..");
      docdb.init(exports, cb);
    }
  ], cb);
}

exports.quit = function (cb)
{
  client.quit(cb);
}

exports.get = function (key, cb)
{
  client.get(key,
    function (err, val)
    {
      if(err)
      {
        cb(err);
      }
      else
      {
        var obj = JSON.parse(val);
        cb(null, obj);
      }
    });
}

exports.getMany = function (key, cb)
{
  async.waterfall([
      // get all keys
      function (_cb)
      {
        client.keys(key, _cb);
      },
      // prepare a MULTI-request to get all values
      function (_keys, _cb)
      {
        var multi = client.multi();
        for(var id in _keys)
        {
          multi.get(_keys[id]);
        }
        multi.exec(_cb);
      },
      // parse all values
      function (_values, _cb)
      {
        for(var id in _values)
        {
          _values[id] = JSON.parse(_values[id]);
        }
        _cb(null, _values);
      }
    ], cb);
}

exports.set = function (key, obj)
{
  client.set(key, JSON.stringify(obj));
}

exports.del = function (key, cb)
{
  client.del(key, cb);
}

exports.keyExists = function (key, cb)
{
  client.keys(key, function (err, keys)
    {
      if(!err && keys.length == 1)
        cb(null, true);
      else
        cb(null, false);
    });
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
