/*
 * tinyosf_exportmodules.js
 *
 * Copyright 2013, Simon Waldherr - http://simon.waldherr.eu/
 * Released under the MIT Licence
 * http://opensource.org/licenses/MIT
 *
 * Github:  https://github.com/shownotes/tinyOSF.js/
 * Version: 0.1.1
 */

/*jslint browser: true, white: true, indent: 2 */
/*exported osfExport_HTML, osfExport_HTMLlist, osfExport_Markdown, osfExport_Chapter */
/*global osfBuildTags */

//these functions are only examples, please consider making your own

function osfExport_HTML(osfItem, status) {
  "use strict";
  var line, parsed;
  if (status !== undefined) {
    return '';
  }
  if (typeof osfItem.timeSec === 'number') {
    if (osfItem.url !== false) {
      line = '<a data-tooltip="' + osfItem.timeSec + '" ' + osfBuildTags(osfItem.tags, true) + ' href="' + osfItem.url + '">' + osfItem.osfline[3].trim() + '</a>';
    } else {
      line = '<span data-tooltip="' + osfItem.timeSec + '" ' + osfBuildTags(osfItem.tags, true) + '>' + osfItem.osfline[3].trim() + '</span>';
    }
  } else {
    if (osfItem.url !== false) {
      line = '<a' + osfBuildTags(osfItem.tags, true) + ' href="' + osfItem.url + '">' + osfItem.osfline[3].trim() + '</a>';
    } else {
      line = '<span' + osfBuildTags(osfItem.tags, true) + '>' + osfItem.osfline[3].trim() + '</span>';
    }
  }
  if (osfItem.tags.indexOf('chapter') !== -1) {
    line = '<h2>' + line + ' <small>(' + osfItem.timeHMS + ')</small></h2>';
    parsed = line;
  } else {
    parsed = line + '; ';
  }
  return parsed;
}

function osfExport_HTMLlist(osfItem, status) {
  "use strict";
  var line, parsed = '';
  if (status !== undefined) {
    if (status === 'post') {
      return '</ol>';
    }
    if (status === 'pre') {
      return '';
    }
    return '';
  }
  if (typeof osfItem.timeSec === 'number') {
    if (osfItem.url !== false) {
      line = '<a data-tooltip="' + osfItem.timeSec + '" ' + osfBuildTags(osfItem.tags, true) + ' href="' + osfItem.url + '">' + osfItem.osfline[3].trim() + '</a>';
    } else {
      line = '<span data-tooltip="' + osfItem.timeSec + '" ' + osfBuildTags(osfItem.tags, true) + '>' + osfItem.osfline[3].trim() + '</span>';
    }
  } else {
    if (osfItem.url !== false) {
      line = '<a' + osfBuildTags(osfItem.tags, true) + ' href="' + osfItem.url + '">' + osfItem.osfline[3].trim() + '</a>';
    } else {
      line = '<span' + osfBuildTags(osfItem.tags, true) + '>' + osfItem.osfline[3].trim() + '</span>';
    }
  }
  if (osfItem.tags.indexOf('chapter') !== -1) {
    line = '<h2><span>' + osfItem.timeHMS + '</span> ' + line + '</h2>';
    parsed = line;
  } else {
    if (osfItem.iteminfo.afterChapter === 1) {
      parsed += '<ol>';
    }
    parsed += '<li>' + line + '</li>';
    if (osfItem.iteminfo.nextisChapter === true) {
      parsed += '</ol>';
    }
  }
  return parsed;
}

function osfExport_HTMLlist(osfItem, status) {
  "use strict";
  var line, parsed = '';
  if (status !== undefined) {
    if (status === 'post') {
      return '</ol>';
    }
    if (status === 'pre') {
      return '';
    }
    return '';
  }
  if (typeof osfItem.timeSec === 'number') {
    if (osfItem.url !== false) {
      line = '<a data-tooltip="' + osfItem.timeSec + '" ' + osfBuildTags(osfItem.tags, true) + ' href="' + osfItem.url + '">' + osfItem.osfline[3].trim() + '</a>';
    } else {
      line = '<span data-tooltip="' + osfItem.timeSec + '" ' + osfBuildTags(osfItem.tags, true) + '>' + osfItem.osfline[3].trim() + '</span>';
    }
  } else {
    if (osfItem.url !== false) {
      line = '<a' + osfBuildTags(osfItem.tags, true) + ' href="' + osfItem.url + '">' + osfItem.osfline[3].trim() + '</a>';
    } else {
      line = '<span' + osfBuildTags(osfItem.tags, true) + '>' + osfItem.osfline[3].trim() + '</span>';
    }
  }
  if (osfItem.tags.indexOf('chapter') !== -1) {
    line = '<h2><span>' + osfItem.timeHMS + '</span> ' + line + '</h2>';
    parsed = line;
  } else {
    if (osfItem.iteminfo.afterChapter === 1) {
      parsed += '<ol>';
    }
    parsed += '<li>' + line + '</li>';
    if (osfItem.iteminfo.nextisChapter === true) {
      parsed += '</ol>';
    }
  }
  return parsed;
}

function osfExport_Markdown(osfItem, status) {
  "use strict";
  var line, parsed;
  if (status !== undefined) {
    return '';
  }
  if (osfItem.url !== false) {
    line = '[' + osfItem.osfline[3].trim() + '](' + osfItem.url + ')';
  } else {
    line = osfItem.osfline[3].trim();
  }
  if (osfItem.tags.indexOf('chapter') !== -1) {
    line = '\n#' + line + ' ^' + osfItem.timeHMS + '  \n';
    parsed = line;
  } else {
    parsed = line + '; ';
  }
  return parsed;
}

function osfExport_Chapter(osfItem, status) {
  "use strict";
  if (status !== undefined) {
    return '';
  }
  if (osfItem.tags.indexOf('chapter') !== -1) {
    return osfItem.timeHMS + ' ' + osfItem.osfline[3].trim() + '\n';
  }
  return '';
}

function osfExport_Glossary(osfItem, status) {
  "use strict";
  if (status !== undefined) {
    return '';
  }
  if (osfItem.tags.indexOf('glossary') !== -1) {
    return osfItem.timeHMS + ' ' + '<a' + osfBuildTags(osfItem.tags, true) + ' href="' + osfItem.url + '">' + osfItem.osfline[3].trim() + '</a>' + '\n';
  }
  return '';
}
