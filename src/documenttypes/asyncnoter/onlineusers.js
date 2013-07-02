
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
  var users = [];

  if(onlineusers[docname])
  {
    for (var user in onlineusers[docname])
    {
      users.push(onlineusers[docname][user].data);
    }
  }

  return users;
}

exports.add = function (docname, username, data)
{
  if(!onlineusers[docname])
    onlineusers[docname] = {};

  var user = onlineusers[docname][username];
  if(user)
  {
    clearTimeout(user.timeoutId);
  }

  onlineusers[docname][username] = {};

  onlineusers[docname][username].data = data;
  onlineusers[docname][username].timeoutId = setTimeout(function ()
  {
    exports.clearOnlineUser(docname, username);
  }, 11000);
}

exports.clearOnlineUser = function (docname, username)
{
  delete onlineusers[docname][username];
}
