const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const getPackageInfo = require('../lib/getPackageInfo');

describe('getPackageInfo', () => {
  let tempDir;
  let prevCwd;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-tools-pkginfo-'));
    await fs.writeJson(path.join(tempDir, 'package.json'), {
      name: '@kne/demo-pkg',
      version: '9.8.7',
      description: 'demo'
    });
    prevCwd = process.cwd();
    process.chdir(tempDir);
  });

  afterEach(async () => {
    process.chdir(prevCwd);
    await fs.remove(tempDir);
  });

  it('应返回完整 package.json', async () => {
    const info = await getPackageInfo();
    assert.equal(info.name, '@kne/demo-pkg');
    assert.equal(info.version, '9.8.7');
  });

  it('name 应去掉 scope；packageName/packageScope 特殊字段', async () => {
    assert.equal(await getPackageInfo('name'), 'demo-pkg');
    assert.equal(await getPackageInfo('packageName'), '@kne/demo-pkg');
    assert.equal(await getPackageInfo('packageScope'), 'kne');
    assert.equal(await getPackageInfo('version'), '9.8.7');
  });
});
