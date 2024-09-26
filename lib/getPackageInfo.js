const fs = require("fs-extra");
const path = require("path");
const getPackageJson = () => fs.readJson(path.resolve(process.cwd(), './package.json'));
module.exports = async (key) => {
    const packageJson = await getPackageJson();
    if (key && packageJson.hasOwnProperty(key)) {
        return packageJson[key];
    }
    return packageJson;
};
