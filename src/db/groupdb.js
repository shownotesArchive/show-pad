var db
  , async  = require('async')
  , util   = require('util');

exports.name = "group";

function Group (short, name, type)
{
  if(!name || !short)
    throw "Invalid arguments";
  if(!type)
    type = "closed";
  if(type != "open" && type != "closed")
    throw "Invalid arguments";
  this.name = name;
  this.short = short;
  this.type = type;
}

Group.prototype =
{
  constructor: Group
}

exports.init = function (_db, _cb)
{
  db =_db;
  _cb(null);
}

exports.createGroup = function (short, name, type, cb)
{
  var group = new Group(short, name, type);

  exports.groupExists(group.short,
    function (err, exists)
    {
      if(!exists)
        db.set("group:" + group.short, group);

      cb(exists ? "groupexists" : null);
    });
}

exports.getGroup = function (short, cb)
{
  db.get("group:" + short, function (err, group)
  {
    if(!group)
    {
      cb("nogroup", null);
    }
    else
    {
      var objGroup = new Group(group.short, group.name, group.type);
      cb(err, objGroup);
    }
  });
}

exports.updateGroup = function (groupChanges, cb)
{
  var groupshort = groupChanges.short;

  async.waterfall(
    [
      // get the current group
      function (cb)
      {
        exports.getGroup(groupshort, cb);
      },
      // apply changes & update the group
      function (group, cb)
      {
        if(!group)
        {
          cb("nogroup");
        }
        else
        {
          for(var prop in groupChanges)
          {
            group[prop] = groupChanges[prop];
          }
          db.set("group:" + groupshort, group);
          cb(null, group);
        }
      }
    ], cb);
}

exports.deleteGroup = function (short, cb)
{
  db.del("group:" + short, cb);
}

exports.getGroups = function (cb)
{
  db.getMany('group',
    function (err, groups)
    {
      if(groups)
      {
        for (var id in groups)
        {
          var objGroup = new Group(groups[id].short, groups[id].name, groups[id].type);
          groups[id] = objGroup;
        }
      }
      cb(err, groups);
    });
}

exports.groupExists = function (short, cb)
{
  db.objExists("group:" + short, cb);
}
