var async  = require('async')
  , debug = false
  , db;

exports.init = function (_db, _cb)
{
  db = _db;
  _cb();
}

exports.handle = function (cmd, req, res)
{
  var user = req.session.user;
  if(!user && !debug)
  {
    answerRequest(res, 401, "Unauthorized", null);
    return;
  }

  async.waterfall([
      // Get requesting user
      function (cb)
      {
        db.user.getUser(user, cb);
      },
      // Check rights
      function (_user, _cb)
      {
        user = _user;
        _cb(null, debug || user.hasRole("admin"));
      }
    ],
    // handle the API-Request
    function (error, result)
    {
      if(!result)
      {
        answerRequest(res, 401, "Unauthorized", null);
      }
      else
      {
        switch(cmd)
        {
          case "get-users":
            handleGetUsers(res, answerRequest);
            break;
          case "get-user":
            handleGetUser(req.params.name, res, answerRequest);
            break;
        }
      }
    });
}

function answerRequest(res, statusCode, msg, data)
{
  var response =
    {
      status: statusCode,
      message: msg,
      data: data
    };

  res.statusCode = statusCode;
  res.end(JSON.stringify(response));
}

function handleGetUsers (res, cb)
{
  db.user.getUsers(function (err, users)
  {
    if(err)
    {
      cb(res, 500, err);
    }
    else
    {
      for(var id in users)
      {
        delete users[id].salt;
        delete users[id].password;
      }

      var statusCode = users.length == 0 ? 204 : 200;
      cb(res, statusCode, "ok", users);
    }
  });
}

function handleGetUser (username, res, cb)
{
  db.user.getUser(username,
    function (err, user)
    {
      if(err == "nouser")
      {
        cb(res, 404, "User not found", null);
      }
      else if(err)
      {
        cb(res, 500, err, null);
      }
      else
      {
        delete user.salt;
        delete user.password;
        cb(res, 200, "ok", user);
      }
    });
}
