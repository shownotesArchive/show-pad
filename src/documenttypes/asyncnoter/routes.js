var async   = require('async')
  , express = require('express')
  , path    = require('path')
  , url     = require('url')

var asyncnoter      = null
  , server          = null
  , logger          = null

var mediafilechecker = null
  , onlineusers     = null

exports.name = "async-routes";

exports.init = function (_asyncnoter, _server, _logger, cb)
{
  asyncnoter = _asyncnoter;
  server = _server;
  logger = _logger;

  cb();
}

exports.initExpress = function (app)
{
  // can't do that in init() because the plugin are not yet fully loaded
  onlineusers = asyncnoter.plugins["async-onlineusers"];
  mediafilechecker = asyncnoter.plugins["async-mediafilechecker"];

  app.use("/sharejs/channel", express.static(path.resolve(__dirname + '/../../../node_modules/share/node_modules/browserchannel/dist')));
  app.use("/jwerty", express.static(path.resolve(__dirname + '/../../../node_modules/jwerty')));

  app.get("/createasync", getCreateAsync);
  app.post("/createasync", postCreateAsync);
  app.get("/createasync/checkstatus", getCreateAsyncCheckStatus);

  app.get("/async/onlineusers/:docname", getOnlineusers);
  app.post("/async/onlineusers/:docname", postOnlineusers);

  app.get('/js/osftools.js', function (req, res) { res.sendfile(__dirname + "/osftools.js"); });
}

function getCreateAsync(req, res)
{
  if(!asyncnoter.canCreateDoc(res.locals.user))
    return res.redirect("/");

  res.render('documenttypes/asyncnoter_create.ejs', {});
}

function postCreateAsync(req, res)
{
  var docname = req.param("docname");
  var mediaurls = req.param("formats");
  var newMediaurls = []
    , useableMediaurls = []
    , doc = null
    , values =
    {
      "docname": docname
    }

  for (var media in mediaurls)
  {
    var uurl = mediaurls[media];
    if(uurl.indexOf("http://") != 0)
      uurl = "http://" + uurl;

    values["format-" + media] = uurl;
    newMediaurls.push(
      {
        media: media,
        url: uurl
      }
    );
  }

  values = JSON.stringify(values);
  values = encodeURIComponent(values);

  async.series(
    [
      // check doc name
      function (cb)
      {
        if(!/^[a-z][0-9a-z_-]{5,}$/i.test(docname))
          cb("docname");
        else
          cb();
      },
      // check media urls
      function (cb)
      {
        async.each(newMediaurls,
          function (mediaUrl, cb)
          {
            var parsedUrl = url.parse(mediaUrl.url);

            mediafilechecker.checkMediaFileUrl(parsedUrl,
              function (err, result)
              {
                if(result.result == "ok")
                  useableMediaurls.push(mediaUrl);

                cb();
              }
            );
          },
          cb
        );
      },
      // create doc
      function (cb)
      {
        if(useableMediaurls.length == 0)
          return cb("media");

        server.db.doc.createDoc(docname, "asyncnoter", "pod", cb);
      },
      // set media urls
      function (cb)
      {
        var docChanges =
        {
          docname: docname,
          async:
          {
            mediaurls: {}
          }
        };

        for (var i in useableMediaurls)
        {
          var name = useableMediaurls[i].media;

          docChanges.async.mediaurls[name] =
          {
            url: useableMediaurls[i].url
          }
        }

        server.db.doc.updateDoc(docChanges, cb);
      },
      // get the finished doc
      function (cb)
      {
        server.db.doc.getDoc(docname,
          function (err, _doc)
          {
            doc = _doc;
            cb(err);
          }
        );
      },
      // create doc in asyncnoter
      function (cb)
      {
        server.documentTypes.onCreateDoc(doc, cb);
      }
    ],
    function (err)
    {
      if(err)
      {
        var userError = "other";

        if(err == "media" || err == "docname" || err == "docexists")
          userError = err;

        console.log("Error while creating asyncdoc: " + err);

        res.redirect("/createasync?error=" + userError + "&values=" + values)
      }
      else
      {
        res.redirect("/doc/" + docname);
      }
    }
  )
}

function getCreateAsyncCheckStatus(req, res)
{
  if(!asyncnoter.canCreateDoc(res.locals.user) || !req.query.url)
    return res.end();

  var uurl = req.query.url;
  if(uurl.indexOf("http://") != 0)
    uurl = "http://" + uurl;
  var fileUrl = url.parse(uurl);

  console.log("Requesting %s//%s%s for %s", fileUrl.protocol, fileUrl.host, fileUrl.pathname, res.locals.user.username);

  mediafilechecker.checkMediaFileUrl(fileUrl,
    function (err, status)
    {
      res.json(status);
    }
  )
}

function getOnlineusers(req, res)
{
  var user = res.locals.user;
  var docname = req.param("docname");

  if(user)
  {
    var users = onlineusers.get(docname);
    res.json({ users: users });
  }
  else
  {
    res.end();
  }
}

function postOnlineusers(req, res)
{
  var user = res.locals.user;
  var docname = req.param("docname");
  var data = req.body;

  if(user)
  {
    var isLengthValid = Object.keys(data).length == 2;
    var isTimeValid = (data.time || data.time == 0) && /^[0-9]+$/.test(data.time);
    var isPlayingValid = data.playing == "true" || data.playing == "false";

    if(isLengthValid && isTimeValid && isPlayingValid)
    {
      onlineusers.add(docname, user.username,
        {
          time: parseInt(data.time, 10),
          playing: (data.playing === 'true'),
          username: user.username
        }
      );
    }
  }

  res.end();
}
