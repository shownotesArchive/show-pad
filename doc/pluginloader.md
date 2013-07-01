# Pluginloader

The pluginloader is used in various places such as API, DB or Doctypes to load
multiple files of the same type. Each plugin has a have a name and a `init(cb)`-function.

A barebones plugin could look like this:
```javascript
// File: ./src/plugins/helpers.js

exports.name = "helpers";

exports.init = function (foo, cb)
{
  console.log(foo + 2); // will log `42`, see next code block
  cb();
}

```

An arbitary file located in `/src/` which loads the plugins:
```javascript
var pluginloader = require('./pluginloader.js');
var foo = 40;

// Arguments of `load`:
//   * dir to load the plugins from
//   * arguments to pass into `init` of each plugin
//   * a logger to write log-messages to
//   * callback

pluginloader.load("./plugins/", [foo], logger,
  function (err, plugins)
  {
    console.log("Loaded %s plugins!", plugins.length);
  }
);
```
