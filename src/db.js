var ueberDB = require('ueberDB')
  , async   = require('async')
  , userdb  = require('./userdb.js')
  , db;

exports.user = userdb;

exports.init = function (cb)
{
  async.series([
    initUeberDB,
    function ()
    {
      userdb.init(db, cb);
    }
  ]);
}

function initUeberDB(cb)
{
  db = new ueberDB.database("dirty", { filename: "dirty.db" });
  db.init(function (err)
  {
    if(err) 
    {
      console.error(err);
      process.exit(1);
    }

    cb(null);
  });
}
