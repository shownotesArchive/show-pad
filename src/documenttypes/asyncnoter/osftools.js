var osftools = {};

osftools.name = "async-osftools";

osftools.init = function (_asyncnoter, _server, _logger, cb)
{
  cb();
}

osftools.osfFromNotes = function (notes, cb)
{
  var osfNotes = [];

  for (var i = 0; i < notes.length; i++)
  {
    var note = notes[i];

    osfNotes.push(
      {
        index: i,
        text: note.text,
        time: note.time
      }
    );
  }

  osfNotes.sort(
    function (a, b)
    {
      if(a.time != b.time)
        return a.time - b.time;
      else
        return a.index - b.index;
    }
  );

  var osf = "HEADER\n/HEADER\n";

  for (var i = 0; i < osfNotes.length; i++)
  {
    var note = osfNotes[i];
    osf += "\n" + osftools.toHumanTime(note.time) + " " + note.text;
  }

  cb(null, osf);
}

osftools.notesFromOsf = function (osf, cb)
{
}

osftools.toHumanTime = function (time)
{
  var seconds = pad(time % 60, 2);
  var minutes = pad(Math.floor((time / 60) % 60), 2);
  var hours = pad(Math.floor((time / 60 / 60) % 60), 2);

  return hours + ":" + minutes + ":" + seconds;

  // http://stackoverflow.com/a/10073788
  function pad(n, width, z) {
    z = z || '0';
    n = n + '';
    return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
  }
}

osftools.fromHumanTime = function (humantime)
{
  var timeParts = humantime.split(':');
  var time = 0;

  if(timeParts.length != 3)
  {
    return false;
  }

  for (var i = 0; i < timeParts.length; i++)
  {
    timeParts[i] = parseInt(timeParts[i], 10);

    if(Number.isNaN(timeParts[i]))
    {
      return false;
    }

    time += timeParts[i] * Math.max(((timeParts.length - i - 1) * 60), 1);
  }

  return time;
}

if(typeof exports != "undefined")
{
  var keys = Object.keys(osftools);

  for (var i = 0; i < keys.length; i++)
  {
    exports[keys[i]] = osftools[keys[i]];
  }
}
