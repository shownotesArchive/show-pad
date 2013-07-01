
exports.name = "async-onlineusers";

var asyncnoter
  , server
  , logger
  , onlineusers = {}

exports.init = function (_asyncnoter, _server, _logger, cb)
{
  asyncnoter = _asyncnoter
  server = _server;
  logger = _logger;

  cb();
}

exports.get = function (docname)
{
  if(onlineusers[docname])
    return Object.keys(onlineusers[docname]);
  else
    return [];
}

exports.add = function (docname, username)
{
  if(!onlineusers[docname])
    onlineusers[docname] = {};

  var timeoutID = onlineusers[docname][username];
  if(timeoutID)
  {
    clearTimeout(timeoutID);
  }

  onlineusers[docname][username] = setTimeout(function ()
  {
    exports.clearOnlineUser(docname, username);
  }, 11000);
}

exports.clearOnlineUser = function (docname, username)
{
  delete onlineusers[docname][username];
}
