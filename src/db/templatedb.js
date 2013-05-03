var db
  , ejs   = require('ejs')
  , async = require('async');

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
      getRawTemplate,
      function (tpl, cb)
      {
        applyFields(tpl.text, fields, cb);
      }
    ],
    cb
  )
}

exports.applyFields = function (tpl, fields, cb)
{
  var text = ejs.render(tpl, fields);
  cb(text);
}
