const generateEntryHtml = require('./lib/generateEntryHtml');
const getLatestVersion = require('./lib/getLatestVersion');
const getNextVersion = require('./lib/getNextVersion');

module.exports = {
    generateEntryHtml,
    getLatestVersion,
    getNextMajorVersion: getNextVersion.major,
    getNextMinorVersion: getNextVersion.minor,
    getNextPatchVersion: getNextVersion.patch
};
