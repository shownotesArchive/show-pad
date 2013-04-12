/*
 * tinyOSF.js
 *
 * Copyright 2013, Simon Waldherr - http://simon.waldherr.eu/
 * Released under the MIT Licence
 * http://opensource.org/licenses/MIT
 *
 * Github:  https://github.com/shownotes/tinyOSF.js/
 * Version: 0.0.6
 */

/*jslint browser: true*/
/*exported osfParser, osfExport*/

function osfExtractTags(tagString, urlString) {
  "use strict";
  var tagArray = [], tagTempArray = [], i, urlTemp, tagTemp;
  tagTempArray = tagString.split(' ');
  for (i = 0; i < tagTempArray.length; i += 1) {
    tagTemp = tagTempArray[i].replace('#', '').trim();
    if (tagTemp.length === 1) {
      if (tagTemp === 'c') {
        tagTemp = 'chapter';
      } else if (tagTemp === 't') {
        tagTemp = 'topic';
      } else if (tagTemp === 'g') {
        tagTemp = 'glossary';
      } else if (tagTemp === 'l') {
        tagTemp = 'link';
      } else if (tagTemp === 's') {
        tagTemp = 'section';
      } else if (tagTemp === 'v') {
        tagTemp = 'video';
      } else if (tagTemp === 'a') {
        tagTemp = 'audio';
      } else if (tagTemp === 'i') {
        tagTemp = 'image';
      } else if (tagTemp === 'q') {
        tagTemp = 'quote';
      }
    }
    if (tagTemp.length > 3) {
      tagArray[i] = tagTemp;
    }
  }
  if (urlString !== false) {
    urlTemp = urlString.split('/')[2];
    if (Array.isArray(urlTemp)) {
      urlTemp = urlTemp.split('.');
      tagArray[i + 1] = urlTemp[urlTemp.length - 2] + urlTemp[urlTemp.length - 1];
    }
  }
  return tagArray;
}

function osfBuildTags(tagArray, withClass) {
  "use strict";
  var i, output = '';
  for (i = 0; i < tagArray.length; i += 1) {
    if (typeof tagArray[i] === 'string') {
      if (tagArray[i].trim().length > 3) {
        output += ' osf_' + tagArray[i];
      }
    }
  }
  if (withClass === true) {
    return ' class="' + output + '"';
  }
  return output;
}

function osfTimestampsToHMS(now, starttimestamp) {
  "use strict";
  var time = parseInt(now, 10) - parseInt(starttimestamp, 10), hours, minutes, seconds, returntime = '';
  hours = Math.floor(time / 3600);
  minutes = Math.floor((time - (hours * 3600)) / 60);
  seconds = time - (hours * 3600) - (minutes * 60);
  returntime += (hours < 10) ? '0' + hours + ':' : hours + ':';
  returntime += (minutes < 10) ? '0' + minutes + ':' : minutes + ':';
  returntime += (seconds < 10) ? '0' + seconds : seconds;
  return returntime;
}

function osfHMSToTimestamp(hms) {
  "use strict";
  var time = 0, timeArray, regex = /((\d+\u003A)?(\d+\u003A)?(\d+)(\u002E\d+)?)/;
  if (hms === undefined) {
    return;
  }
  timeArray = regex.exec(hms.trim());
  if (timeArray !== null) {
    time += parseInt(timeArray[2], 10) * 3600;
    time += parseInt(timeArray[3], 10) * 60;
    time += parseInt(timeArray[4], 10);
  } else {
    return undefined;
  }
  return time;
}

function osfParser(string) {
  "use strict";
  var osfArray, i = 0, output = [], osfRegex = /(^([(\d{9,})(\u002D+)(\d+\u003A\d+\u003A\d+(\u002E\d*)?) ]*)?([\u0020-\u0022\u0024-\u003B\u003D\u003F-\u007D\u00C0-\u00FF]+) *(\u003C[\S]*\u003E)?((\s*\u0023[\S]* ?)*)\n*)/gmi;
  while ((osfArray = osfRegex.exec(string)) !== null) {
    output[i] = osfArray;
    i += 1;
  }
  return output;
}

function osfExport(osf, mode) {
  "use strict";
  var i, osfline, line, tags, url, osfFirstTS, osfFirstHMS, osfTime, timeSec, timeHMS, parsed = '';
  for (i = 0; i < osf.length; i += 1) {
    osfline = osf[i];
    osfTime = osfline[2];
    if (/(\d{9,})/.test(osfTime) !== false) {
      osfTime = parseInt(osfTime, 10);
      if (osfFirstTS === undefined) {
        osfFirstTS = osfTime;
      }
      timeHMS = osfTimestampsToHMS(osfTime, osfFirstTS);
      timeSec = osfTime - osfFirstTS;
    } else if (/(\d+:\d+:\d+(\.\d*)?)/.test(osfTime) !== null) {
      if (osfFirstHMS === undefined) {
        osfFirstHMS = osfTime;
      }
      timeHMS = osfTime;
      timeSec = osfHMSToTimestamp(osfTime);
    }
    if (typeof osfline[4] === 'string') {
      url = osfline[4].replace(/\u003C/, '').replace(/\u003E/, '');
    } else {
      url = false;
    }
    tags = osfExtractTags(osfline[5], url);
    if (osfline !== undefined) {
      if ((mode === 'html')||(mode === undefined)) {
        if (typeof timeSec === 'number') {
          if (url !== false) {
            line = '<a data-tooltip="' + timeSec + '" ' + osfBuildTags(tags, true) + ' href="' + url + '">' + osfline[3].trim() + '</a>';
          } else {
            line = '<span data-tooltip="' + timeSec + '" ' + osfBuildTags(tags, true) + '>' + osfline[3].trim() + '</span>';
          }
        } else {
          if (url !== false) {
            line = '<a' + osfBuildTags(tags, true) + ' href="' + url + '">' + osfline[3].trim() + '</a>';
          } else {
            line = '<span' + osfBuildTags(tags, true) + '>' + osfline[3].trim() + '</span>';
          }
        }
        if (tags.indexOf('chapter') !== -1) {
          line = '<h2>' + line + '<small>(' + timeHMS + ')</small></h2>';
          parsed += line;
        } else {
          parsed += line + '; ';
        }
      } else if (mode === 'md') {
        if (url !== false) {
          line = '[' + osfline[3].trim() + '](' + url + ')';
        } else {
          line = osfline[3].trim();
        }
        if (tags.indexOf('chapter') !== -1) {
          line = '\n#' + line + ' ^' + timeHMS + '  \n';
          parsed += line;
        } else {
          parsed += line + '; ';
        }
      } else if (mode === 'chapter') {
        if (tags.indexOf('chapter') !== -1) {
          parsed += timeHMS + ' ' + osfline[3].trim() + '\n';
        }
      }
    }
  }
  return parsed;
}
