var async = require('async');

var db
  , server;

exports.name = "groups";

exports.init = function (_db, _server, cb)
{
  db = _db;
  server = _server;
  cb();
}

exports.getOne = function (res, req, answerRequest)
{
  var groupname = req.params.entity;

  db.group.getGroup(groupname,
    function (err, group)
    {
      if(err == "nogroup")
      {
        answerRequest(res, 404, "Group not found", null);
      }
      else if(err)
      {
        answerRequest(res, 500, err, null);
      }
      else
      {
        answerRequest(res, 200, "ok", group);
      }
    });
}

exports.getMany = function (res, req, answerRequest)
{
  db.group.getGroups(function (err, groups)
  {
    if(err)
    {
      answerRequest(res, 500, err);
    }
    else
    {
      if(req.query["datatables"])
      {
        for(var id in groups)
        {
          groups[id].DT_RowId = groups[id].groupname;
        }
      }

      answerRequest(res, 200, "ok", groups);
    }
  });
}

exports.createOne = function (res, req, answerRequest)
{
  var group = req.body;
  var missing = [];

  if(!group.name)
    missing.push("name");
  if(!group.short)
    missing.push("short");
  if(!group.type)
    missing.push("type");

  if(missing.length != 0)
  {
    answerRequest(res, 400, "Missing values, see data.", missing);
    return;
  }

  db.group.createGroup(group.short, group.name, group.type, function (err)
  {
    if(err)
    {
      answerRequest(res, 500, err, null);
    }
    else
    {
      server.documentTypes.onCreateGroup(group,
        function (err)
        {
          if(err)
            answerRequest(res, 500, err, null);
          else
            answerRequest(res, 200, "ok", group);
        });
    }
  });
}

exports.updateOne = function (res, req, answerRequest)
{
  var group = req.body;
  group.short = req.params.entity;

  db.group.updateGroup(group,
    function (err)
    {
      if(err)
        answerRequest(res, 500, err, null);
      else
        answerRequest(res, 200, "ok", null);
    });
}

exports.deleteOne = function (res, req, answerRequest)
{
  var groupshort = req.params.entity;

  db.group.deleteGroup(groupshort,
    function (err)
    {
      if(err)
      {
        answerRequest(res, 500, err, null);
      }
      else
      {
        answerRequest(res, 200, "ok", null);
      }
    });
}
