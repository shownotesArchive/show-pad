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
  var startPos, prefix, postfix;

  startPos = key.indexOf('*');
  prefix = key.substring(0, startPos);
  if(startPos != key.length - 1)
    postfix = key.substring(startPos);

  async.waterfall([
      // get all keys
      function (_cb)
      {
        client.keys(prefix + '*', _cb);
      },
      // prepare a MULTI-request to get all values
      function (_keys, _cb)
      {
        var multi = client.multi();
        for(var id in _keys)
        {
          if(!postfix || _values[id].indexOf(postfix))
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
