const assert = require('node:assert/strict');
const getLatestVersion = require('../lib/getLatestVersion');
const getNextVersion = require('../lib/getNextVersion');

describe('getLatestVersion', () => {
  it('应使用注入的 loadNpmInfo 返回 version', async () => {
    const version = await getLatestVersion('@kne/demo', {
      loadNpmInfo: async (name) => {
        assert.equal(name, '@kne/demo');
        return { version: '1.2.3' };
      }
    });
    assert.equal(version, '1.2.3');
  });
});

describe('getNextVersion.bumpSemver', () => {
  it('应按位递增并清零后续位', () => {
    assert.equal(getNextVersion.bumpSemver('1.2.3', 0), '2.0.0');
    assert.equal(getNextVersion.bumpSemver('1.2.3', 1), '1.3.0');
    assert.equal(getNextVersion.bumpSemver('1.2.3', 2), '1.2.4');
  });

  it('非标准 semver 应抛错', () => {
    assert.throws(() => getNextVersion.bumpSemver('1.2.3-beta', 2), /不能自动生成下一个版本号/);
  });
});

describe('getNextVersion major/minor/patch', () => {
  const options = {
    loadNpmInfo: async () => ({ version: '1.2.3' })
  };

  it('应基于最新版本计算下一版本', async () => {
    assert.equal(await getNextVersion.major('@kne/x', options), '2.0.0');
    assert.equal(await getNextVersion.minor('@kne/x', options), '1.3.0');
    assert.equal(await getNextVersion.patch('@kne/x', options), '1.2.4');
  });
});
