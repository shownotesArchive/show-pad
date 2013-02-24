HTTP-API
========

General
-------

### URL
The endpoint for all calls looks like: `/api/$VERSION/$METHOD/$THING`, `$THING` is not required for some calls.

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
### USERS
#### `GET` /api/1/users
Returns all users in this form:
```JSON
"data":
  [
    {"username":"userA", "email":"admin@showpad.org"},
    {"username":"userB", "email":"asd@google.com"},
  ]
```
Possible status codes:
* `204`, there are no users, `data` is an empty array
* `200`, everything went fine, get your users from `data`
* `500`, there was an error while getting the user, see `message`

#### `GET` /api/1/users/userA
Returns a single user `userA` in this form:
```JSON
"data":
  {"username":"userA", "email":"admin@showpad.org"}
```
Possible status codes:
* `404`, user does not exist
* `200`, everything went fine, get your user from `data`
* `500`, there was an error getting the user, see `message`

#### `DELETE` /api/1/users/userA    NOT YET IMPLEMTED
Deletes `userA`.

Possible status codes:
* `404`, user does not exist
* `200`, everything went fine, user has been deleted
* `500`, there was an error while deleting the user, see `message`

#### `POST` /api/1/users   NOT YET IMPLEMTED
Creates a new user based on the JSON given as POST-Data:
```
{
  "username": "userA",
  "email": "admin@showpad.org"
  "password": "pass"
}
```
* `password` is given in cleartext, it will be salted and hashed on the server.

Possible status codes:
* `400`, malformed user-data, see `message`
* `201`, everything went fine, the user was created
* `500`, there was an while error getting the user, see `message`

#### `PUT` /api/1/users/userA    NOT YET IMPLEMTED
Updates `userA` baded on the JSON given as POST-Data:
```
{
  "email": "admin@showpad.org"
  "password": "pass"
}
```
* The `username` cannot be changed
* `password` is given in cleartext, it will be salted and hashed on the server

Possible status codes:
* `400`, malformed user-data, see `message`
* `200`, everything went fine, user has been created
* `404`, user does not exist
* `500`, there was an error while creating the user, see `message`

