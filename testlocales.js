// this script is used to check if all locaes are up to date
// with the first one. It simply tries to find all strings
// which are in the very first locale given in `localename`
// in all the other locales.

var localenames = [ "en", "de" ]
var locales = {};

for(var i = 0; i < localenames.length; i++)
{
  var locale = localenames[i];
  locales[locale] = require('./locales/' + locale + '.json');
}

for(var i = 1; i < localenames.length; i++)
{
  console.log('Missing in %s:', localenames[i]);
  for(var str in locales[localenames[0]])
  {
    if(!locales[localenames[i]][str])
      console.error('    "%s": "%s",', str, locales[localenames[0]][str]);
  }
}

