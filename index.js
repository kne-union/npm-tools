const generateEntryHtml = require('./lib/generateEntryHtml');
const getLatestVersion = require('./lib/getLatestVersion');
const getNextVersion = require('./lib/getNextVersion');
const initProject = require('./lib/initProject');
const generateManifest = require('./lib/generateManifest');

module.exports = {
    generateEntryHtml,
    getLatestVersion,
    initProject,
    generateManifest,
    getNextMajorVersion: getNextVersion.major,
    getNextMinorVersion: getNextVersion.minor,
    getNextPatchVersion: getNextVersion.patch
};
