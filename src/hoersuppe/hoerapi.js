var http = require('http');

exports.getPodcasts = function (cb)
{
  callAction("getPodcasts", {}, cb);
}

exports.getPodcastData = function (podcast, cb)
{
  cb = arguments[arguments.length - 1];
  callAction("getPodcasts", { podcast: podcast}, cb);
}

exports.getPodcastLive = function (podcast, count, cb)
{
  cb = arguments[arguments.length - 1];
  var params = { podcast: podcast};
  if(count)
    params.count = count;
  callAction("getPodcastLive", params, cb);
}

exports.getPodcastEpisodes = function (podcast, count, cb)
{
  cb = arguments[arguments.length - 1];
  var params = { podcast: podcast};
  if(count)
    params.count = count;
  callAction("getPodcastEpisodes", params, cb);
}

exports.getLive = function (count, dateStart, dateEnd, cb)
{
  cb = arguments[arguments.length - 1];
  var params = { };
  if(count)
    params.count = count;
  if(dateStart)
    params.dateStart = formatDate(dateStart);
  if(dateEnd)
    params.dateEnd = formatDate(dateEnd);
  callAction("getLive", params, cb);
}

function formatDate(date)
{
  if(date instanceof Date)
  {
    var year = date.getFullYear().toString().substr(2,2);
    var month = padStr(date.getMonth() + 1);
    var day = padStr(date.getDate());

    return year + "-" + month + "-" + day;
  }
  else
  {
    throw "Invalid Date";
  }
}

function padStr(str)
{
  if(!(str instanceof String))
  {
    str = str+'';
  }
  if(str.length == 1)
  {
    str = "0" + str;
  }
  return str;
}

function callAction(action, parameters, cb)
{
  var reqUrl = "http://hoersuppe.de/api/?action=" + action;

  for (var param in parameters)
  {
    reqUrl += "&" + param + "=" + parameters[param];
  }

  http.get(reqUrl,
    function(res)
    {
      var body = "";

      res.on('data', function (chunk)
      {
        body += chunk;
      });

      res.on('end', function()
      {
        body = JSON.parse(body);
        if(body.status == 1)
        {
          cb(null, body.data);
        }
        else
        {
          cb(body.msg, null);
        }
      });
    }
  );
}
