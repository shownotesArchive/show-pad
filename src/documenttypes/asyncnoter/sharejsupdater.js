var async = require('async')

exports.name = "async-sharejsupdater";

var asyncnoter
  , server
  , logger

exports.init = function (_asyncnoter, _server, _logger, cb)
{
  asyncnoter = _asyncnoter;
  server = _server;
  logger = _logger;

  cb();
}

exports.updateDocuments = function (docs, model, cb)
{
  logger.info("Updating documents..");

  async.waterfall(
    [
      // get snapshots of all docs
      function (cb)
      {
        var newDocs = [];
        logger.debug("Found %s docs to update", docs.length);

        async.map(docs,
          function (doc, cb)
          {
            model.getSnapshot(doc.docname,
              function (err, snapshot)
              {
                if(err)
                {
                  logger.error("Could not get snapshot of doc %s: %s", doc.docname, err);
                }
                else
                {
                  doc.snapshot = snapshot;
                  newDocs.push(doc);
                }

                cb();
              }
            );
          },
          function (err)
          {
            cb(null, newDocs);
          }
        );
      },
      // check documents
      function (docs, cb)
      {
        async.each(docs,
          function (doc, cb)
          {
            var snapshot = doc.snapshot;
            var docname = doc.docname;

            var metaProps =
              [
                {
                  name: "editors",
                  value: {}
                }
              ];

            var notesProps =
              [
                {
                  name: "index", // don't modify notes in document when generating OSF, ab92dec4af461fc7987bea9f800cffff063c3209
                  delete: true
                }
              ];

            var props =
              [
                {
                  path: "meta",
                  props: metaProps
                },
                {
                  path: "notes",
                  props: notesProps
                }
              ];

            var updatedPaths = [];

            async.each(props,
              function (prop, cb)
              {
                fixDocObject(docname, snapshot, prop.path, prop.props,
                  function (err, updated)
                  {
                    if(err)
                    {
                      console.error("Could not update doc %s (%s): %s", docname, prop.path, err);
                    }
                    else if(updated)
                    {
                      updatedPaths.push(prop.path);
                    }

                    cb();
                  }
                );
              },
              function ()
              {
                if(updatedPaths.length > 0)
                {
                  console.info("Doc %s: updated!", docname);
                }
                else
                {
                  console.debug("Doc %s: no update needed", docname);
                }

                cb();
              }
            );
          },
          cb
        );
      }
    ],
    function (err)
    {
      if(err)
      {
        logger.error("Could not update docs", err);
      }
      else
      {
        logger.info("Docs updated");
      }

      cb();
    }
  )
}

function fixDocObject(docname, snapshot, path, props, cb)
{
  var ops = [];
  var content = snapshot.snapshot;
  var v = snapshot.v;

  for (var i = 0; i < content[path].length; i++)
  {
    var item = content[path][i];
    var missings = checkDocItem(item, props);

    for (var j = 0; j < missings.length; j++)
    {
      var missing = missings[j];

      var op =
      {
        "p": [ path, i, missing.name ]
      };

      if(missing.value && !missing.delete)
        op.oi = missing.value;
      else if(!missing.value && missing.delete)
        op.od = missing.currentValue;
      else
        console.error("Invalid prop: " + missing.name)

      ops.push(op);
    }
  }

  if(ops.length > 0)
  {
    asyncnoter.applyOp(docname, ops, v,
      function (err)
      {
        cb(err, true);
      }
    );
  }
  else
  {
    cb(null, false);
  }
}

function checkDocItem(obj, props)
{
  var missings = [];

  for (var i = 0; i < props.length; i++)
  {
    var prop = props[i];

    if( prop.delete &&  obj[prop.name] ||
      !prop.delete && !obj[prop.name])
    {
      prop.currentValue = obj[prop.name];
      missings.push(prop);
    }
  }

  return missings;
}
