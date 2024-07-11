#!/usr/bin/env node

const npmTool = require('./index');
const fs = require('fs-extra');
const path = require('path');
const downloadNpmPackage = require('@kne/fetch-npm-package');
const {select} = require('@inquirer/prompts');
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
        npmTool.getLatestVersion(args[1]).then((version) => console.log(version)).catch((err) => {
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
        downloadNpmPackage(...args[1].split(/(?<!^)@/)).catch((err) => {
            throw err;
        });
        break;
    case 'deploy':
        console.log('执行manifest部署');
        npmTool.deployManifest().catch((err) => {
            throw err;
        });
        break;
    case 'deployPackage':
        console.log('执行package部署');
        npmTool.deployPackage().catch((err) => {
            throw err;
        });
        break;
    case 'entryHtml':
        npmTool.generateEntryHtml().catch((err) => {
            throw err;
        });
        break;
    case 'manifest':
        npmTool.generateManifest().catch((err) => {
            throw err;
        });
        break;
    case 'init':
    default:
        if (!args[1]) {
            throw new Error('项目名不能缺省');
        }
        (async () => {
            const templateArgs = args[2] ? args[2].split(/(?<!^)@/) : [await select({
                message: '请选择模板类型', choices: [{name: 'NodeJS Libs', value: '@kne-template/node'},
                    {name: 'Fastify Server Project', value: '@kne-template/fastify-server'},
                    {name: 'Fastify Business Project', value: '@kne-template/fastify-app'}, {
                        name: 'Frontend Libs', value: '@kne-template/libs'
                    }, {name: 'Remote Components', value: '@kne-template/remote'}, {
                        name: 'Business Project', value: '@kne-template/project'
                    }, {
                        name: 'WeChat Miniprogram Libs', value: '@kne-template/miniprogram-libs'
                    }, {
                        name: 'WeChat Miniprogram Project', value: '@kne-template/miniprogram-project'
                    }],
            })];

            npmTool.initProject(args[1], ...templateArgs).catch((err) => {
                throw err;
            });
        })();
}


