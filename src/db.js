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

function getObjFromValues(values, prefixLen)
{
  var obj = {};

  for (var redisKey in values)
  {
    var objKey = redisKey.substr(prefixLen);
    var val = values[redisKey];
    if (isNumber(val))
      val = parseFloat(val);
    obj[objKey] = val;
  }

  return obj;
}
exports.get = function (key, cb)
{
  async.waterfall([
      // get the datatype
      function (_cb)
      {
        client.get("__datatype:" + key, _cb);
      },
      // get the data
      function (datatype, _cb)
      {
        if(datatype == "object")
        {
          exports.getManyValues(key + ":*",
            function (err, values)
            {
              if(err)
              {
                cb(err);
                return;
              }

              var prefixLen = key.length + 1; // ':' => +1
              var obj = getObjFromValues(values, prefixLen);
              _cb(null, obj);
            });
        }
        else if(datatype == "simple")
        {
          client.get(key, _cb);
        }
        else
        {
          _cb("unkndatatype");
        }
      }
    ], cb);
}

exports.getManyValues = function (key, cb)
{
  var keys;
  var types;

  async.waterfall([
      // get all keys
      function (_cb)
      {
        client.keys(key, _cb);
      },
      // get all types
      function (_keys, _cb)
      {
        keys = _keys;
        var multi = client.multi();
        for(var id in _keys)
        {
          multi.type(_keys[id]);
        }
        multi.exec(_cb);
      },
      // get all values
      function (_types, _cb)
      {
        types = _types;

        var multi = client.multi();
        for(var i = 0; i < keys.length; i++)
        {
          if(types[i] == "string")
            multi.get(keys[i]);
          else if(types[i] == "list")
            multi.lrange(keys[i], 0, -1);
        }
        multi.exec(_cb);
      },
      // return values
      function (_values, _cb)
      {
        var retn = {};
        for(var i = 0; i < _values.length; i++)
        {
          retn[keys[i]] = _values[i];
        }
        _cb(null, retn);
      }
    ], cb);
}

exports.getMany = function (key, cb)
{
  var prefixLen = key.split(':')[0].length + 1;

  async.waterfall([
      // the the raw data
      function (cb)
      {
        exports.getManyValues(key, cb);
      },
      // convert to individual objects
      function (values, cb)
      {
        var groupedValues = {};
        for(var i in values)
        {
          var val = values[i];
          var key = i.substr(prefixLen).split(':');
          var objName = key[0];
          var propName = key[1];

          if(!groupedValues[objName])
            groupedValues[objName] = {};
          groupedValues[objName][propName] = val;
        }

        var objects = [];
        for(var i in groupedValues)
        {
          objects.push(getObjFromValues(groupedValues[i]));
        }
        cb(null, objects);
      }
    ], cb);
}

exports.set = function (key, val)
{
  var multi = client.multi();

  if(typeof val == "object")
  {
    multi.set("__datatype:" + key, "object");

    for (var prop in val)
    {
      var propKey = key + ":" + prop;

      if(val[prop] == null)
      {
        multi.del(propKey); // null => remove from db
      }
      else if(val[prop] instanceof Array)
      {
        multi.del(propKey); // empty the list
        for (var i in val[prop])
        {
          multi.lpush(propKey, stringifyIfNeeded(val[prop][i]));
        }
      }
      else // normal obj or string
      {
        multi.set(propKey, stringifyIfNeeded(val[prop]));
      }
    }
  }
  else
  {
    multi.set("__datatype:" + key, "simple");
    multi.set(key, val);
  }

  multi.exec();
}

exports.del = function (key, cb)
{
  async.waterfall([
    // get the datatype
    function (_cb)
    {
      client.get("__datatype:" + key, _cb);
    },
    // delete
    function (datatype, _cb)
    {
      client.del("__datatype:" + key);
      if(datatype == "object")
      {
        client.keys(key + ":*",
          function (err, keys)
          {
            if(err)
            {
              cb(err);
              return;
            }

            var multi = client.multi();
            for(var i in keys)
            {
              multi.del(keys[i]);
            }
            multi.exec(_cb);
          });
      }
      else if(datatype == "simple")
      {
        client.del(key, _cb);
      }
      else
      {
        _cb("unkndatatype");
      }
    }
  ], cb);
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

exports.objExists = function (key, cb)
{
  exports.keyExists("__datatype:" + key, cb);
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

function stringifyIfNeeded(obj)
{
  if (typeof obj == "object")
    return JSON.stringify(obj);
  else
    return obj;
}

// http://stackoverflow.com/a/1830844
function isNumber(n)
{
  return !isNaN(parseFloat(n)) && isFinite(n);
}
