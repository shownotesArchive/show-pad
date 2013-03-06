var db;

exports.name = "users";

exports.init = function (_db, cb)
{
  db = _db;
  cb();
}

exports.getOne = function (res, params, query, answerRequest)
{
  var username = params.entity;

  db.user.getUser(username,
    function (err, user)
    {
      if(err == "nouser")
      {
        answerRequest(res, 404, "User not found", null);
      }
      else if(err)
      {
        answerRequest(res, 500, err, null);
      }
      else
      {
        delete user.salt;
        delete user.password;
        answerRequest(res, 200, "ok", user);
      }
    });
}

exports.getMany = function (res, params, query, answerRequest)
{
  db.user.getUsers(function (err, users)
  {
    if(err)
    {
      answerRequest(res, 500, err);
    }
    else
    {
      for(var id in users)
      {
        delete users[id].salt;
        delete users[id].password;

        if(query["datatables"])
          users[id].DT_RowId = users[id].username;
      }

      answerRequest(res, 200, "ok", users);
    }
  });
}

exports.setOneDT = function (body, res, params, query, cb)
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
