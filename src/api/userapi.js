var async = require('async');

var db, server;

exports.name = "users";

exports.init = function (_db, _server, cb)
{
  server = _server;
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
        prepareUser(user);
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
        prepareUser(users[id]);

        if(req.query["datatables"])
          users[id].DT_RowId = users[id].username;
      }

      answerRequest(res, 200, "ok", users);
    }
  });
}

function prepareUser(user)
{
  delete user.salt;
  delete user.password;
  delete user.iterations;
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

  async.series(
    [
      function (cb)
      {
        if(user.status == "banned")
        {
          async.waterfall(
            [
              // get the sessions from db
              function (cb)
              {
                db.user.getUser(user.username,
                  function (err, user)
                  {
                    if(!user || err)
                    {
                      console.err("Could not kick user (db): ", user.username, err);
                      cb(err);
                    }
                    else
                    {
                      cb(null, user);
                    }
                  })
              },
              // kill document sessions
              function (user, cb)
              {
                server.documentTypes.onLogout(user, null,
                  function (err)
                  {
                    if(err)
                      console.warn("Could not kick user (doc): ", user.username, err);
                    cb();
                  });
              }
            ], function () { cb(); });
        }
        else
          cb();
      },
      function (cb)
      {
        db.user.updateUser(user,
          function (err)
          {
            if(err)
              answerRequest(res, 500, err, null);
            else
              answerRequest(res, 200, "ok", null);
          });
      }
    ]
  );
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
