const downloadNpmPackage = require('@kne/fetch-npm-package');
const fs = require('fs-extra');
const path = require('path');
const inquirer = require('@inquirer/prompts');
const applyTemplate = require('@kne/apply-template');
const spawn = require('cross-spawn-promise');
const initProject = (projectName, packageName, targetVersion) => downloadNpmPackage(packageName, targetVersion, {
    callback: async (dir) => {
        const promptsConfigPath = path.resolve(dir, './prompts.json');
        const templateOptions = {};
        if (await fs.exists(promptsConfigPath)) {
            const promptsConfig = fs.readJson(promptsConfigPath);
            for (let current of promptsConfig) {
                const {name, type, options} = current;
                if (!name) {
                    console.warn(`模板中的prompts必须设置name属性，程序将会忽略该项prompt参数获取，请自行检查是否会受此影响`);
                    continue;
                }
                if (!inquirer[type]) {
                    console.warn(`模板中的prompts类型[${type}]不被支持，程序将会忽略该项prompt参数获取，请自行检查是否会受此影响`);
                    continue;
                }
                const prompts = inquirer[type];

                templateOptions[name] = await prompts(options);
            }
        }

        const projectPath = path.resolve(process.cwd(), projectName);
        await fs.emptyDir(projectPath);
        await applyTemplate(path.resolve(dir, './template'), projectPath, templateOptions);
        console.log(`项目${projectName}初始化完成，更新package.json依赖包到最新`);
        await spawn('npx', ['npm-check-updates'], {
            cwd: projectPath, stdio: 'inherit'
        });
        console.log('开始安装依赖');
        await spawn('npm', ['i', '--legacy-peer-deps'], {
            cwd: projectPath, stdio: 'inherit'
        });
        console.log('完成项目初始化创建，拜拜👋');
    }
});

module.exports = initProject;
