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
    setDeepProperty(obj, objKey, val);
  }

  return obj;
}

function setDeepProperty(obj, key, val)
{
  var firstSep = key.indexOf(':');
  if(firstSep == -1)
  {
    obj[key] = val;
  }
  else
  {
    var firstKey = key.substr(0, firstSep);
    if(!obj[firstKey])
      obj[firstKey] = {};
    setDeepProperty(obj[firstKey], key.substr(firstSep + 1), val);
  }
}

exports.get = function (key, cb)
{
  async.waterfall([
      // get all keys for the object
      function (_cb)
      {
        client.smembers(key, _cb);
      },
      // get all values
      function (keys, _cb)
      {
        exports.getManyValues(keys,
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
    ], cb);
}

exports.getObjectsOfType = function (type, cb)
{
  client.smembers(type, cb);
}

exports.getManyValues = function (keys, cb)
{
  var types;

  async.waterfall([
      // get all types
      function (_cb)
      {
        var multi = client.multi();
        for(var id in keys)
        {
          multi.type(keys[id]);
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
            multi.lrange(keys[i], 0, -2); // skip last member since it's just the placeholder
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

exports.getMany = function (type, cb)
{
  async.waterfall([
      // get names of objects
      function (_cb)
      {
        exports.getObjectsOfType(type, _cb);
      },
      // load the objects
      function (names, _cb)
      {
        async.map(names,
          function (name, __cb)
          {
            exports.get(type + ":" + name, __cb);
          }, _cb);
      },
      // convert to individual objects
      function (rawObjects, cb)
      {
        var objects = [];
        for(var i in rawObjects)
        {
          objects.push(getObjFromValues(rawObjects[i]));
        }
        cb(null, objects);
      }
    ], cb);
}

exports.set = function (key, val)
{
  var flatObj = flattenObject(val, key);
  var keyParts = key.split(':');
  var type = keyParts[0];
  var name = keyParts[1];

  var multi = client.multi();

  multi.sadd(key, Object.keys(flatObj));
  multi.sadd(type, name);

  for (var subKey in flatObj)
  {
    var subVal = flatObj[subKey];

    if(subVal == null)
    {
      multi.del(subKey);
      multi.srem(key, subKey);
    }
    else if(subVal instanceof Array)
    {
      multi.del(subKey); // empty the list
      for (var i in subVal)
      {
        multi.rpush(subKey, subVal[i]);
      }
      // placeholder to keep redis from deleting empty lists
      multi.rpush(subKey, "___");
    }
    else
    {
      multi.set(subKey, subVal);
    }
  }

  multi.exec();
}

function flattenObject(obj, name)
{
  var flatObj = {};

  if(typeof obj == "object")
  {
    if(Object.keys(obj).length == 0)
    {
      console.warn("Empty object: " + name + " will be discarded.");
    }

    for (var prop in obj)
    {
      if(!obj.hasOwnProperty(prop))
        continue;

      var propKey = name + ":" + prop;

      if(obj[prop] == null)
      {
        flatObj[propKey] = null;
      }
      else if(obj[prop] instanceof Array)
      {
        flatObj[propKey] = [];
        for (var i in obj[prop])
        {
          if(typeof obj[prop][i] == "object")
          {
            throw "Objects in arrays are not supported, since they are stored as lists in redis.";
          }
          else
          {
            flatObj[propKey][i] = obj[prop][i];
          }
        }
      }
      else // object, string or number
      {
        mergeObjects(flatObj, flattenObject(obj[prop], propKey));
      }
    }
  }
  else
  {
    flatObj[name] = obj;
  }

  return flatObj;
}

function mergeObjects(o1, o2)
{
  for (var prop in o2)
    o1[prop] = o2[prop];
}

exports.del = function (key, cb)
{
  var keyParts = key.split(':');
  var type = keyParts[0];
  var name = keyParts[1];

  async.waterfall([
    // get all keys for the object
    function (_cb)
    {
      client.smembers(key, _cb);
    },
    // delete all keys and remove object from index
    function (keys, _cb)
    {
      var multi = client.multi();
      for(var i in keys)
      {
        multi.del(keys[i]);
      }
      multi.del(key);
      multi.srem(type, name);
      multi.exec(_cb);
    }
  ], cb);
}

exports.objExists = function (key, cb)
{
  client.exists(key, cb);
}

function initRedis(cb)
{
  console.debug("Initiating redis..");
  client = redis.createClient(options.socket);

  client.on("connect", function ()
    {
      /*
      var obj = {a: "b", "b": "a", "c": [0, 1, 2], "d": { "foo": "bar", "fuz": { "spengr": "co" } }, "e": {}};
      exports.set("foo:zero", obj);
      exports.get("foo:zero",
        function (err, obj2)
        {
          console.log(obj);
          console.log(obj2);
        });
        */
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
