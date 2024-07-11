const download = require('@kne/fetch-npm-package');
const loadPackageInfo = require('@kne/load-npm-info');
const path = require("path");
module.exports = async (packageName) => {
    const name = path.resolve(process.cwd(), process.env.PACKAGE_NAME) || packageName;
    const outputDir = path.resolve(process.cwd(), process.env.OUTPUT_PATH || './build');
    if (!name) {
        throw new Error('环境变量PACKAGE_NAME未正确设置');
    }
    console.log(`获取到参数${name},开始执行下载部署...`);
    const info = await loadPackageInfo(name);
    await download(info.packageName, info.version, {
        outputPath: path.resolve(outputDir, `./${info.packageName}/${info.version}`)
    });
};
