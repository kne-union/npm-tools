const path = require('path');
const fs = require('fs-extra');
const download = require('@kne/fetch-npm-package');
const transform = require('lodash/transform');
module.exports = async () => {
    const inputDir = path.resolve(process.cwd(), process.env.INPUT_PATH || './manifest.json');
    const outputDir = path.resolve(process.cwd(), process.env.OUTPUT_PATH || './build');
    if (!await fs.exists(inputDir)) {
        throw new Error('入口文件不存在');
    }
    const info = await fs.readJson(inputDir);
    const res = await Promise.allSettled(transform(['remote-components', 'libs', 'blogs'], (result, value) => {
        info[value] && info[value].length > 0 && result.push(...info[value]);
    }, []).map(async (item) => {
        for (let version of Object.keys(item.versions)) {
            await download(item.packageName, version, {
                outputPath: path.resolve(outputDir, `./${item.packageName}/${version}`)
            });
        }
        await fs.copy(path.resolve(outputDir, `./${item.packageName}/${item.version}`),path.resolve(outputDir, `./${item.packageName}/latest`));
    }));

    const rejectedList = res.filter(({status}) => status === 'rejected');
    if (rejectedList.length === 0) {
        console.log('完成所有下载任务');
    } else {
        console.error(`有${rejectedList.length}个任务失败,失败原因为:`, ...rejectedList.map(({reason}) => reason));
    }
};
