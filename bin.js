#!/usr/bin/env node

const npmTool = require('./index');
const fs = require('fs-extra');
const path = require('path');
const downloadNpmPackage = require('@kne/fetch-npm-package')

const args = process.argv.slice(2);

const script = args[0];

console.log(`执行命令:${script || 'entryHtml'}`);

const writeToPackageJson = async (func) => {
    const packageJsonPath = path.resolve(process.cwd(), 'package.json');
    let packageJson = await fs.readJson(packageJsonPath);
    try {
        const version = await func();
        packageJson = Object.assign({}, packageJson, version && {version});
    } catch (err) {
        console.error(err.message || '发生内部错误');
    }
    console.log(packageJson.version);
    await fs.writeJson(packageJsonPath, packageJson);
};


switch (script) {
    case 'latestVersion':
        npmTool.getLatestVersion().then((version) => console.log(version)).catch((err) => {
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
    case 'download':
        console.log(`开始下载package:${args[1]}`);
        if (!args[1]) {
            throw new Error('参数传递不正确');
        }
        downloadNpmPackage(...args[1].split('@'));
        break;
    case 'entryHtml':
    default:
        npmTool.generateEntryHtml().catch((err) => console.error(err));
}


