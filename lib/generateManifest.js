const fs = require('fs-extra');
const path = require('path');
const loadPackageInfo = require('@kne/load-npm-info');
const {parse} = require('@kne/md-doc');
const lodash = require('lodash');

const getManifestInfo = async () => {
    const packageJson = await fs.readJson(path.resolve(process.cwd(), process.env.MANIFEST_FILE || 'package.json'));

    const manifest = {};

    await Promise.all(Object.keys(Object.assign({}, packageJson['manifest-config'])).map(async (type) => {
        manifest[type] = (await Promise.all(packageJson['manifest-config'][type].map(async (item) => {
            const {name, options} = (() => {
                if (typeof item === 'string') {
                    return {name: item, options: {}};
                }
                if (Array.isArray(item) && item.length > 0) {
                    return {name: item[0], options: Object.assign({}, item[1])};
                }
                if (lodash.isPlainObject(item) && item.hasOwnProperty('name')) {
                    return {name: item.name, options: lodash.omit(item, ['name'])};
                }
            })(item);

            return loadPackageInfo(name).then((info) => {
                return Object.assign({}, info, {options, readme: parse(info.readme)});
            }).catch((e) => {
                console.error(`包信息获取失败:${name}`);
                throw e;
            });
        })));
        return manifest;
    }));

    return manifest;
};

const generateManifest = async () => {
    const output = path.resolve(process.cwd(), process.env.OUTPUT_PATH || 'build');
    await fs.emptyDir(output);
    await fs.emptyDir(path.resolve(output, 'readme'));
    await fs.emptyDir(path.resolve(output, 'list'));
    const manifest = await getManifestInfo();
    let readmeTask = [];

    const allManifest = lodash.transform(manifest, (result, value, key) => {
        result[key] = value.map((item) => {
            const target = Object.assign({}, item, {
                versions: lodash.transform(Object.values(item.versions).sort((a, b) => {
                    return (new Date(b.time)).valueOf() - (new Date(a.time)).valueOf();
                }), (result, value) => {
                    const key = value.version;
                    if (Array.isArray(item.options.abandonedVersion) && item.options.abandonedVersion.length > 0 && item.options.abandonedVersion.indexOf(key) > -1) {
                        return;
                    }
                    if (item.version === key || Array.isArray(item.options.importantVersion) && item.options.importantVersion.length > 0 && item.options.importantVersion.indexOf(key) > -1 || Object.keys(result).length < (item.options.maxLength || 0)) {
                        result[key] = value;
                    }
                }, {})
            });
            readmeTask.push({name: `${key}/${target.name}.json`, readme: target.readme});
            return lodash.omit(target, ['readme', 'options']);
        });
    });

    await fs.writeJson(path.resolve(output, 'manifest.json'), allManifest);
    await Promise.all(readmeTask.map(async ({name, readme}) => {
        await fs.ensureDir(path.dirname(path.resolve(output, 'readme', name)));
        await fs.writeJson(path.resolve(output, 'readme', name), readme);
    }));

    await fs.writeJson(path.resolve(output, 'remote-components.json'), [...allManifest['remote-components'], ...allManifest['libs']]);

    await Promise.all(Object.keys(allManifest).map(async (key) => {
        const value = allManifest[key];
        await fs.writeJson(path.resolve(output, `list/${key}.json`), value.map(({
                                                                                    name, packageName, version, versions
                                                                                }) => {
            return {
                name, packageName, version, versions, readme: `readme/${key}/${name}.json`
            };
        }));
    }));
};

module.exports = generateManifest;
