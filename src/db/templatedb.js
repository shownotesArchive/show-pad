var db
  , ejs   = require('ejs')
  , async = require('async');

exports.name = "template";

exports.init = function (_db, _cb)
{
  db = _db;
  _cb();
}

exports.saveRawTemplate = function (tpl)
{
  db.setHash("template", tpl);
}

exports.getRawTemplate = function (cb)
{
  db.getHash("template",
    function (err, tpl)
    {
      if(!err && tpl) cb(null, tpl);
      else cb(err);
    }
  );
}

exports.getText = function (fields, cb)
{
  async.waterfall(
    [
      exports.getRawTemplate,
      function (tpl, cb)
      {
        exports.applyFields(tpl.text, fields, cb);
      }
    ],
    cb
  )
}

exports.applyFields = function (tpl, fields, cb)
{
  var text = tpl;

  try
  {
    text = ejs.render(tpl, fields);
  }
  catch (ex)
  {
    console.log("Could not applyFields:", ex);
  }

  cb(null, text);
}
