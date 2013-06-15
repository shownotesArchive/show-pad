var async = require('async')
  , fs    = require('fs')
  , path  = require('path')

exports.load = function (basepath, initArgs, logger, cb)
{
  basepath = path.resolve(basepath);

  async.waterfall(
    [
      // get all items (dirs and files) in basedir
      function (cb)
      {
        fs.readdir(basepath, cb);
      },
      // filter out everything that is not a file
      function (items, cb)
      {
        async.filter(
          items,
          function (item, cb)
          {
            fs.lstat(path.join(basepath, item),
              function (err, stats)
              {
                cb(err ? false : stats.isFile());
              }
            );
          },
          function (items)
          {
            cb(null, items);
          }
        );
      },
      // load plugins and call init-function
      function (files, cb)
      {
        var plugins = {};

        logger.debug("Found %s plugins to load", files.length);

        async.eachSeries(files,
          function (file, cb)
          {
            logger.debug("Loading plugin '%s'..", file);

            var plugin = require(path.join(basepath, file));

            if(!plugin.name)
            {
              logger.error("Could not load plugin %s, it has no name.", file);
              process.exit(1);
            }

            if(plugins[plugin.name])
            {
              logger.error("Could not load plugin %s, a plugin with that name already exists.", file);
              process.exit(1);
            }

            plugins[plugin.name] = plugin;
            plugins[plugin.name].init.apply(this, initArgs.concat(cb));
          },
          function (err)
          {
            cb(err, plugins);
          }
        );
      }
    ],
    cb
  );
}
