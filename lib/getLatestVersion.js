const loadNpmInfo = require('@kne/load-npm-info');
const getLatestVersion = async (name, options = {}) => {
    const packageName = name || process.env.npm_package_name;
    const load = options.loadNpmInfo || loadNpmInfo;
    const {version} = await load(packageName);

    return version;
};

module.exports = getLatestVersion;
