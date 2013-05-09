HTTP-API
========

General
-------

### URL
The endpoint for all calls looks like: `/api/:version/:endpoint/:entity`, `:entity` is not required for some calls.

### Response format
```JSON
{
  "status": 200,
  "message": "ok",
  "data": null
}
```
* `status`, The HTTP-Status-Code (also given in header)
* `message`, A message describing the status
* `data`, The actual result returned by your call, can be left out or null


Endpoints
---------
* `docs`
* `doctexts`
* `groups`
* `users`


api.js
------
`api.js` contains all routing code for the api, it also handles the last mile of responding to the client.
It supports the following HTTP-methods which are routed to the individual API-handlers:

* `GET`
  - with `:entity`: `getOne`
  - without `:entity`: `getMany`
* `POST`
  - with `:entity`: `405`
  - without `:entity`: `createOne`
* `PUT`
  - with `:entity`: `updateOne`
  - without `:entity`: `405`
* `DELTE`
  - with `:entity`: `deleteOne`
  - without `:entity`: `405`


The `api`-directory
-------------------
The `api`-directory contains the individual API-handlers (or endpoints).
The files in `/src/api/` are dynamically loaded, so you don't have to worry about anything when adding a new one.

Each endpoint **has** to implement a number of functions which all have this signature: `function (res, req, answerRequest)`.
The entity given in the url is avialiable in `req.params.entity`, the body supplied by the client when POSTing is in `req.body`,
which can be an object or just an string depending on the `Content-Type` given by the client.
`answerRequest` is the callback which has to be called with the following parameters:
* `res`, the response-object supplied as a parameter to the original function
* `statusCode`, the status-code to use in HTTP and the json-response
* `message`, the message to use in the json-response
* `data`, the message to use in the json-response

Functions for each endpoint:
* `getOne`
* `getMany`
* `createOne`
* `updateOne`
* `deleteOne`

An dummy api-endpoint could look like this:
```javascript```
var db, server;

exports.name = "";

exports.init = function (_db, _server, cb)
{
  server = _server;
  db = _db;
  cb();
}

exports.getOne = function (res, req, answerRequest)
{
  var name = req.params.entity;
  answerRequest(res, 500, "nope", null);
}

exports.getMany = function (res, req, answerRequest)
{
  answerRequest(res, 500, "nope", null);
}

exports.createOne = function (res, req, answerRequest)
{
  var thing = req.body;
  answerRequest(res, 500, "nope", null);
}

exports.updateOne = function (res, req, answerRequest)
{
  var thing = req.body;
  var name = req.params.entity;
  answerRequest(res, 500, "nope", null);
}

exports.deleteOne = function (res, req, answerRequest)
{
  var name = req.params.entity;
  answerRequest(res, 500, "nope", null);
}
```
