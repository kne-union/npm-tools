const fs = require("fs-extra");
const path = require("path");
const get = require('lodash/get');
const getPackageJson = () => fs.readJson(path.resolve(process.cwd(), './package.json'));
module.exports = async (key) => {
    const packageJson = await getPackageJson();
    if (key === 'name') {
        return get(packageJson, key, '').replace(/^@.+\//, '');
    }
    if (key === 'packageScope') {
        return get(packageJson, key, '').match(/^@(.+)\//)?.[1] || '';
    }
    if (key === 'packageName') {
        key = 'name';
    }
    if (key && get(packageJson, key) !== void (0)) {
        return get(packageJson, key);
    }
    return packageJson;
};
