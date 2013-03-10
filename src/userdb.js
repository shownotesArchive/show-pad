var cb
  , async  = require('async')
  , util   = require('util')
  , crypto = require('crypto');

exports.init = function (_db, _cb)
{
  db =_db;
  _cb(null);
}

exports.createUser = function (username, password, email, emailToken, cb)
{
  var user =
    {
      username: username,
      email: email,
      emailToken: emailToken,
      status: "email",
      roles: {"user": {}}
    };

  async.waterfall(
    [
      // check if user exists
      function (_cb)
      {
        exports.userExists(username, function (err, exists)
          {
            _cb(exists ? "userexists" : null);
          });
      },
      // get random salt
      function (_cb)
      {
        crypto.randomBytes(48, _cb);
      },
      // hash password
      function (salt, _cb)
      {
        user.salt = salt.toString('hex');
        hashPassword(password, user.salt, _cb);
      }
    ],
    function (err, result)
    {
      if(!err)
      {
        user.password = result;
        db.set("user:" + username, user);
      }
      cb(err);
    });
}

exports.getUser = function (username, cb)
{
  db.get("user:" + username, function (err, user)
    {
      if(!user)
      {
        cb("nouser", null);
      }
      else
      {
        if(!err)
          addUserFunctions(user);
        cb(err, user);
      }
    });
}

function addUserFunctions(user)
{
  user.hasRole = function (role, group)
    {
      for(var r in this.roles)
      {
        if(r == "groupadmin" && group && r.group == group)
          return true;
        else if(r == role)
          return true;
      }
      return false;
    }
}

exports.updateUser = function (userChanges, cb)
{
  var username = userChanges.username;
  
  async.waterfall(
    [
      // get the current doc
      function (cb)
      {
        exports.getUser(username, cb);
      },
      // apply changes
      function (user, cb)
      {
        if(!user)
        {
          cb("nouser");
        }
        else
        {
          var gotPassword = false;

          for(var prop in userChanges)
          {
            if(prop != "username")
              user[prop] = userChanges[prop];

            if(prop == "password")
            {
              hashPassword(userChanges[prop], user.salt,
                function (err, hash)
                {
                  if(!err)
                  {
                    user.password = hash;
                  }
                  // call the main-callback because it's not called later
                  cb(err, user);
                })
            }
            
            if(userChanges[prop] == null)
              delete user[prop];
          }

          // don't call the callback when we have to set the PW
          if(!gotPassword)
            cb(null, user);
        }
      },
      // update the user
      function (user, cb)
      {
        db.set("user:" + username, user);
        cb();
      }
    ], cb);
}

exports.deleteUser = function (username, cb)
{
  db.del("user:" + username, cb);
}

exports.getUsers = function (cb)
{
  db.getMany('user:*', cb);
}

exports.userExists = function (username, cb)
{
  db.keyExists("user:" + username, cb);
}

exports.checkPassword = function (username, password, cb)
{
  var user;

  async.waterfall(
    [
      // get user
      function (_cb)
      {
        exports.getUser(username, _cb);
      },
      // hash given password
      function (_user, _cb)
      {
        if(_user)
        {
          user = _user;
          hashPassword(password, _user.salt, _cb);
        }
        else
        {
          cb("nouser");
        }
      },
      // compare hashes
      function (_hash, _cb)
      {
        var isValid = (user.password === _hash);
        _cb(null, isValid);
      }
    ], cb);
}

function hashPassword(password, salt, cb)
{
  crypto.pbkdf2(password, salt, 1200, 24, processHash);

  function processHash(err, key)
  {
    if(!err)
      key = Buffer(key, 'binary').toString('hex');
    cb(err, key);
  }
}
