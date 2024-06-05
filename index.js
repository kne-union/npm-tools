const generateEntryHtml = require('./lib/generateEntryHtml');
const getLatestVersion = require('./lib/getLatestVersion');
const getNextVersion = require('./lib/getNextVersion');
const initProject = require('./lib/initProject');
const generateManifest = require('./lib/generateManifest');
const deployManifest = require('./lib/deployManifest');

module.exports = {
    generateEntryHtml,
    deployManifest,
    getLatestVersion,
    initProject,
    generateManifest,
    getNextMajorVersion: getNextVersion.major,
    getNextMinorVersion: getNextVersion.minor,
    getNextPatchVersion: getNextVersion.patch
};
