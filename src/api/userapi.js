var db;

exports.name = "users";

exports.init = function (_db, _server, cb)
{
  db = _db;
  cb();
}

exports.getOne = function (res, req, answerRequest)
{
  var username = req.params.entity;

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

exports.getMany = function (res, req, answerRequest)
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

        if(req.query["datatables"])
          users[id].DT_RowId = users[id].username;
      }

      answerRequest(res, 200, "ok", users);
    }
  });
}


exports.createOne = function (res, req, answerRequest)
{
  var user = req.body;
  var missing = [];

  if(!user.username)
    missing.push("username");
  if(!user.password)
    missing.push("password");
  if(!user.email)
    missing.push("email");

  if(missing.length != 0)
  {
    answerRequest(res, 400, "Missing values, see data.", missing);
    return;
  }

  db.user.createUser(user.username, user.password, user.email, null, function (err)
    {
      if(err)
        answerRequest(res, 500, err, null);
      else
        answerRequest(res, 200, "ok", null);
    });
}

exports.updateOne = function (res, req, answerRequest)
{
  var user = req.body;
  user.username = req.params.entity;

  db.user.updateUser(user,
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
  db.user.deleteUser(req.params.entity,
    function (err)
    {
      if(err)
        answerRequest(res, 500, err, null);
      else
        answerRequest(res, 200, "ok", null);
    });
}
