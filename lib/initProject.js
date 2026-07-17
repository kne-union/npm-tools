const downloadNpmPackage = require('@kne/fetch-npm-package');
const fs = require('fs-extra');
const path = require('path');
const inquirer = require('@inquirer/prompts');
const applyTemplate = require('@kne/apply-template');
const spawn = require('cross-spawn-promise');
const lodash = require('lodash');
const validateName = require('validate-npm-package-name');
const camelCase = require('@kne/camel-case');
const evaluatePromptCondition = require('./promptCondition');
const initProject = (projectName, packageName, targetVersion) => downloadNpmPackage(packageName, targetVersion, {
    callback: async (dir) => {
        const promptsConfigPath = path.resolve(dir, './prompts.json');
        const templateOptions = {};
        const defaultPackageName = ['@kne-template/remote', '@kne-template/project', '@kne-template/miniprogram-project'].indexOf(packageName) > -1 ? `@kne-components/${projectName}` : `@kne/${projectName}`;
        const promptsConfig = [{
            name: 'packageName', type: 'input', options: {
                message: '请输入包名',
                default: validateName(defaultPackageName) ? defaultPackageName : void (0),
                validate: (target) => {
                    const validate = validateName(target);
                    if (!(validate.validForNewPackages && validate.validForOldPackages)) {
                        return validate.errors.join(',');
                    }
                    return validateName(target).validForNewPackages;
                }
            }
        }, {
            name: 'description', type: 'input', options: {
                message: '请输入包的描述信息'
            }
        }];
        if (await fs.exists(promptsConfigPath)) {
            promptsConfig.push(...(await fs.readJson(promptsConfigPath)).filter(({name}) => ['name', 'description'].indexOf(name) === -1));
        }

        for (let current of promptsConfig) {
            const {name, type, options = {}, when} = current;
            if (!name) {
                console.warn(`模板中的prompts必须设置name属性，程序将会忽略该项prompt参数获取，请自行检查是否会受此影响`);
                continue;
            }
            if (!evaluatePromptCondition(when, templateOptions)) {
                const defaultValue = Object.prototype.hasOwnProperty.call(current, 'default') ? current.default : options.default;
                if (defaultValue !== undefined) {
                    templateOptions[name] = defaultValue;
                }
                continue;
            }
            if (!inquirer[type]) {
                console.warn(`模板中的prompts类型[${type}]不被支持，程序将会忽略该项prompt参数获取，请自行检查是否会受此影响`);
                continue;
            }
            const prompts = inquirer[type];

            templateOptions[name] = await prompts(options);
        }

        templateOptions['name'] = templateOptions.packageName.replace(/^@.+\//, '');

        const projectPath = path.resolve(process.cwd(), projectName);
        await fs.emptyDir(projectPath);
        await applyTemplate(path.resolve(dir, './template'), projectPath, Object.assign({}, templateOptions, {
            templateLibs: {
                camelCase, lodash
            }
        }));
        if (await fs.exists(path.resolve(projectPath, 'gitignore'))) {
            await fs.move(path.resolve(projectPath, 'gitignore'), path.resolve(projectPath, '.gitignore'));
        }
        await spawn('git', ['init'], {
            cwd: projectPath, stdio: 'inherit'
        });
        await spawn('git', ['add', '.'], {
            cwd: projectPath, stdio: 'inherit'
        });
        console.log(`项目${projectName}初始化完成，更新package.json依赖包到最新`);
        await spawn('npx', ['npm-check-updates'], {
            cwd: projectPath, stdio: 'inherit'
        });
        console.log('开始安装依赖');
        await spawn('npm', ['i', '--legacy-peer-deps'], {
            cwd: projectPath, stdio: 'inherit'
        });
        const packageJson = await fs.readJson(path.resolve(projectPath, './package.json'));
        if (lodash.get(packageJson, 'scripts.init')) {
            console.log('发现项目中存在初始化命令:init，执行npm run init');
            await spawn('npm', ['run', 'init'], {
                cwd: projectPath, stdio: 'inherit'
            });
        }
        console.log('完成项目初始化创建，拜拜👋');
    }
});

module.exports = initProject;
