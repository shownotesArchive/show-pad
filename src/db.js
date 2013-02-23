var ueberDB = require('ueberDB')
  , async   = require('async')
  , userdb  = require('./userdb.js')
  , options
  , db;

exports.user = userdb;

exports.init = function (_options, cb)
{
  options = _options;
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
  db = new ueberDB.database(options.type, options);
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
