(function ()
{
  var self = {}
    , doc;

  var events =
  {
    "noteAdded": [],   // (index, note)
    "noteRemoved": [], // (index, note)
    "noteEdited": []   // (index, note, changed)
  }

  self.start = function (docname, options, cb)
  {
    if(typeof async == "undefined")
      $.getScript('/js/async.js', doStart);
    else
      doStart();

    function doStart ()
    {
        async.series(
          [
            function (cb)
            {
              var scripts = [
                "/sharejs/channel/bcsocket.js",
                "/sharejs/share.js",
                "/sharejs/json.js"
              ];

              async.eachSeries(scripts,
                function (script, cb)
                {
                  $.getScript(script,
                    function (result)
                    {
                      cb();
                    }
                  );
                },
                cb
              );
            },
            function (cb)
            {
              sharejs.open(docname, 'json', options,
                function (error, _doc)
                {
                  doc = _doc;

                  doc.at("notes").on('insert', onDocInsert);
                  doc.at("notes").on('delete', onDocDelete);
                  doc.at().on('child op', onDocChildOp);

                  cb();
                }
              );
            }
          ],
          function (err)
          {
            cb(err);
          }
        );
    };
  }

  function onDocInsert(index, note)
  {
    triggerEvent("noteAdded", [index, note]);
  }

  function onDocDelete(index, note)
  {
    triggerEvent("noteRemoved", [index, note]);
  }

  function onDocChildOp(path, op)
  {
    if(op.p[0] != "notes")
      return;

    var index = indexFromOp(op);
    var note = getNoteSync(index);
    var changes = {};
    changes[op.p[2]] = op.oi;

    triggerEvent("noteEdited", [index, note, changes]);
  }

  self.addNote = function (note, cb)
  {
    doc.at("notes").push(note,
      function (err, op)
      {
        cb(err);
        if(!err)
        {
          var index = indexFromOp(op);
          triggerEvent("noteAdded", [index, note]);
        }
      }
    );
  }

  self.removeNote = function (index, cb)
  {
    doc.at(["notes", index]).remove(
      function (err, op)
      {
        cb(err);

        if(!err)
        {
          var note = op[0].ld;
          var index = indexFromOp(op);

          triggerEvent("noteRemoved", [index, note]);
        }
      }
    );
  }

  self.editNote = function (index, newNote, cb)
  {
    var oldnote = getNoteSync(index);
    var keys = getKeys(oldnote, newNote);

    async.each(keys,
      function (key, cb)
      {
        if(oldnote[key] == newNote[key])
          return cb();

        doc.at(["notes", index, key]).set(newNote[key],
          function (err, op)
          {
            cb(err);

            if(!err)
            {
              onDocChildOp(op[0].p, op[0]);
            }
          }
        );
      },
      function (err)
      {
        cb(err);
      }
    );
  }

  self.getNotes = function (cb)
  {
    cb(null, getNotesSync());
  }

  function getNotesSync()
  {
    return doc.at("notes").get();
  }

  self.getNote = function (index, cb)
  {
    cb(null, getNoteSync(index));
  }

  function getNoteSync(index)
  {
    return doc.at(["notes", index]).get();
  }

  self.addEventReceiver = function (event, cb)
  {
    if(Object.keys(events).indexOf(event) == -1)
      throw "Unknown Event";

    events[event].push(cb);
  }

  function triggerEvent(event, args)
  {
    if(Object.keys(events).indexOf(event) == -1)
      throw "Unknown Event";

    for (var i = 0; i < events[event].length; i++)
    {
      var cb = events[event][i];
      cb.apply(null, args);
    }
  }

  function indexFromOp(op)
  {
    if(Array.isArray(op))
      op = op[0];

    return parseInt(op.p[1], 10);
  }

  function getKeys()
  {
    var keys = [];

    for (var i = 0; i < arguments.length; i++)
    {
      var arg = arguments[i];
      var argKeys = Object.keys(arg);

      for (var j = 0; j < argKeys.length; j++)
      {
        var argKey = argKeys[j];

        if(keys.indexOf(argKey) == -1)
          keys.push(argKey);
      }
    }

    return keys;
  }

  if(typeof asyncnoterconnectors == "undefined")
    asyncnoterconnectors = {};
  asyncnoterconnectors["share"] = self;
})();
