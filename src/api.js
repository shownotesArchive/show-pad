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
        console.log("API - Command: " + cmd + " - Unauthorized");
        answerRequest(res, 401, "Unauthorized", null);
      }
      else
      {
        console.log("API - Command: " + cmd);
        switch(cmd)
        {
          case "get-users":
            handleGetUsers(res, !!req.query["datatables"], answerRequest);
            break;
          case "get-user":
            handleGetUser(req.params.name, res, answerRequest);
            break;
          case "dt-set-user":
            handleDTSetUser(req.body, res, answerRequest);
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

function handleGetUsers (res, datatables, cb)
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

        if(datatables)
          users[id].DT_RowId = users[id].username;
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

function handleDTSetUser (body, res, cb)
{
  db.user.getUser(body.id,
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
        if(body.columnId == 3 &&
          (body.value == "banned" || body.value == "normal" || body.value == "email"))
        {
          user.status = body.value;
        }
        else if(body.columnId == 2 &&
               (body.value == "admin" || body.value == "user"))
        {
          switch(body.value)
          {
            case "admin":
              user.roles["admin"] = {};
              break;
            case "user":
              delete user.roles.admin;
              break;
          }
        }
        else
        {
          res.statusCode = 400;
          res.end();
          return;
        }

        db.user.updateUser(user);
        res.end(body.value);
      }
    });
}
