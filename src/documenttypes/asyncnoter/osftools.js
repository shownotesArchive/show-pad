
exports.name = "async-osftools";

var asyncnoter

exports.init = function (_asyncnoter, _server, _logger, cb)
{
  asyncnoter = _asyncnoter;

  cb();
}

exports.osfFromNotes = function (notes, cb)
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
    osf += "\n" + getHumanTime(note.time) + " " + note.text;
  }

  cb(null, osf);
}

exports.notesFromOsf = function (osf, cb)
{
}

function getHumanTime(time)
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

function fromHumanTime(humantime)
{
}

exports.getHumanTime = getHumanTime;
exports.fromHumanTime = fromHumanTime;
