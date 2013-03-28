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
      roles: ["user"]
    };

  async.waterfall(
    [
      // check if email exists
      function (_cb)
      {
        exports.emailExists(user.email,
          function (exists)
          {
            _cb(exists ? "emailexists" : null);
          });
      },
      // check if user exists
      function (_cb)
      {
        exports.userExists(username, function (err, exists)
          {
            _cb(exists ? "userexists" : null);
          });
      },
      // hash password
      function (_cb)
      {
        setNewPassword(user, password, _cb);
      }
    ],
    function (err)
    {
      if(!err)
      {
        db.set("user:" + username, user);
      }
      cb(err);
    });
}

exports.emailExists = function (emailToCheck, cb)
{
  async.waterfall(
    [
      // get all user-names
      function (_cb)
      {
        db.getObjectsOfType("user", _cb);
      },
      // get all emails
      function (names, _cb)
      {
        async.map(names,
          function (name, __cb)
          {
            __cb(null, "user:" + name + ":email");
          },
          function (err, names)
          {
            db.getManyValues(names, _cb);
          });
      },
      // check if email exits
      function (emails, _cb)
      {
        for (var user in emails)
        {
          if(emails[user] == emailToCheck)
          {
            _cb(null, true);
            return;
          }
        }
        _cb(null, false);
      }
    ],
    function (err, exists)
    {
      if(err)
      {
        console.warn("Error while checking email: " + err);
        exists = true;
      }
      cb(exists);
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
        cb(err, user);
      }
    });
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
            if(prop == "password")
            {
              gotPassword = true;
              setNewPassword(user, userChanges[prop],
                function (err) { cb(err, user); });
            }
            else
            {
              user[prop] = userChanges[prop];
            }
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
  db.getMany('user', cb);
}

exports.userExists = function (username, cb)
{
  db.objExists("user:" + username, cb);
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
          hashPassword(password, user.salt, user.iterations, _cb);
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

function hashPassword(password, salt, iterations, cb)
{
  crypto.pbkdf2(password, salt, iterations, 32, processHash);

  function processHash(err, key)
  {
    if(!err)
      key = Buffer(key, 'binary').toString('hex');
    cb(err, key);
  }
}

function setNewPassword(user, password, _cb)
{
  var salt = crypto.randomBytes(128).toString('hex');
  var iterations = 90000 + Math.floor(Math.random()*10000);

  hashPassword(password, salt, iterations,
    function (err, hash)
    {
      if(err)
      {
        console.warn("Error while hashing PW: " + err);
        _cb(err);
      }
      else
      {
        user.salt = salt;
        user.iterations = iterations;
        user.password = hash;
        _cb(null);
      }
    });
}
