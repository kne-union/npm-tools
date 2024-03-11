#!/usr/bin/env node

const npmTool = require('./index');
const fs = require('fs-extra');
const path = require('path');

const args = process.argv.slice(2);

const script = args[0];

console.log(`执行命令:${script || 'entryHtml'}`);

const writeToPackageJson = async (func) => {
    const packageJsonPath = path.resolve(process.cwd(), 'package.json');
    const version = await func().catch((err) => {
        console.error(err);
    });
    await fs.writeJson(packageJsonPath, Object.assign({}, await fs.readJson(packageJsonPath), version && {version}));
};


switch (script) {
    case 'latestVersion':
        npmTool.getLatestVersion().then(async (version) => console.log(version)).catch((err) => {
            throw err;
        });
        break;
    case 'nextMajorVersion':
        writeToPackageJson(npmTool.getNextMajorVersion).catch((err) => {
            throw err;
        });
        break;
    case 'nextMinorVersion':
        writeToPackageJson(npmTool.getNextMinorVersion).catch((err) => {
            throw err;
        });
        break;
    case 'nextPatchVersion':
        writeToPackageJson(npmTool.getNextPatchVersion).catch((err) => {
            throw err;
        });
        break;
    case 'entryHtml':
    default:
        npmTool.generateEntryHtml().catch((err) => console.error(err));
}


