const getLatestVersion = require('./getLatestVersion');

const computedNextVersion = async (name, index) => {
    const version = await getLatestVersion(name);
    if (!/^[0-9]+\.[0-9]+\.[0-9]+$/.test(version)) {
        throw new Error(`当前版本${version}不能自动生成下一个版本号，请手动设置`);
    }
    const list = version.split('.');
    list.splice(index, 1, 1 + parseInt(list[index]));
    return list.join('.');
};

module.exports = {
    major: (name) => computedNextVersion(name, 0),
    minor: (name) => computedNextVersion(name, 1),
    patch: (name) => computedNextVersion(name, 2),
};
