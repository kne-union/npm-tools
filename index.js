const generateEntryHtml = require('./lib/generateEntryHtml');
const getLatestVersion = require('./lib/getLatestVersion');
const getNextVersion = require('./lib/getNextVersion');
const initProject = require('./lib/initProject');
const generateManifest = require('./lib/generateManifest');
const deployManifest = require('./lib/deployManifest');
const deployPackage = require('./lib/deployPackage');

module.exports = {
    generateEntryHtml,
    deployManifest,
    deployPackage,
    getLatestVersion,
    initProject,
    generateManifest,
    getNextMajorVersion: getNextVersion.major,
    getNextMinorVersion: getNextVersion.minor,
    getNextPatchVersion: getNextVersion.patch
};
