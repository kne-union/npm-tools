const loadNpmInfo = require('@kne/load-npm-info');
const getLatestVersion = async (name) => {
    const packageName = name || process.env.npm_package_name;
    const {version} = await loadNpmInfo(packageName);

    return version;
};

module.exports = getLatestVersion;
