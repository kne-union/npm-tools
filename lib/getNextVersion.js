const getLatestVersion = require('./getLatestVersion');

const bumpSemver = (version, index) => {
    if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) {
        throw new Error(`当前版本${version}不能自动生成下一个版本号，请手动设置`);
    }
    const list = version.split('.');
    list.splice(index, 1, 1 + parseInt(list[index], 10));
    for (let i = index + 1; i < list.length; i++) {
        list[i] = 0;
    }
    return list.join('.');
};

const computedNextVersion = async (name, index, options = {}) => {
    const version = await getLatestVersion(name, options);
    return bumpSemver(version, index);
};

module.exports = {
    major: (name, options) => computedNextVersion(name, 0, options),
    minor: (name, options) => computedNextVersion(name, 1, options),
    patch: (name, options) => computedNextVersion(name, 2, options),
    bumpSemver
};
