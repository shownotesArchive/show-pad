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

