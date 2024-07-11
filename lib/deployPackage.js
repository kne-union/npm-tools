const download = require('@kne/fetch-npm-package');
const loadPackageInfo = require('@kne/load-npm-info');
const path = require("path");
module.exports = async (packageName) => {
    const name = packageName || path.resolve(process.cwd(), process.env.NAME);
    const outputDir = path.resolve(process.cwd(), process.env.OUTPUT_PATH || './build');
    if (!name) {
        throw new Error('环境变量NAME未正确设置');
    }
    const info = await loadPackageInfo(name);
    await download(info.packageName, info.version, {
        outputPath: path.resolve(outputDir, `./${info.packageName}/${info.version}`)
    });
};
