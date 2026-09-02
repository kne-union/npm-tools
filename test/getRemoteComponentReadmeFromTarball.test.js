const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('fs-extra');
const os = require('node:os');
const Module = require('node:module');

const { parsePackageSpec } = require('../lib/getRemoteComponentReadmeFromTarball');

describe('getRemoteComponentReadmeFromTarball.parsePackageSpec', () => {
  it('解析 scoped 包名与版本', () => {
    assert.deepEqual(parsePackageSpec('@kne-components/components-core@0.6.0'), {
      packageName: '@kne-components/components-core',
      version: '0.6.0'
    });
    assert.deepEqual(parsePackageSpec('@kne-components/components-core'), {
      packageName: '@kne-components/components-core',
      version: undefined
    });
  });
});

describe('getRemoteComponentReadmeFromTarball', () => {
  let tempDir;
  let originalLoad;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'remote-readme-'));
    originalLoad = Module._load;
  });

  afterEach(async () => {
    Module._load = originalLoad;
    await fs.remove(tempDir);
  });

  it('应只读取 tarball 内 build/README.md', async () => {
    const packageDir = path.join(tempDir, 'package');
    await fs.ensureDir(path.join(packageDir, 'build'));
    await fs.writeFile(path.join(packageDir, 'README.md'), '# root should not be used');
    await fs.writeFile(path.join(packageDir, 'build', 'README.md'), '# FormInfo\n\nfrom build');
    await fs.writeJson(path.join(packageDir, 'package.json'), {
      name: '@kne-components/components-core',
      version: '0.6.0'
    });

    Module._load = function (request, parent, isMain) {
      if (request === '@kne/fetch-npm-package') {
        return async (name, version, options) => {
          assert.equal(name, '@kne-components/components-core');
          assert.equal(version, '0.6.0');
          await options.callback(packageDir);
        };
      }
      return originalLoad(request, parent, isMain);
    };

    delete require.cache[require.resolve('../lib/getRemoteComponentReadmeFromTarball')];
    const getRemoteComponentReadmeFromTarball = require('../lib/getRemoteComponentReadmeFromTarball');

    const doc = await getRemoteComponentReadmeFromTarball('@kne-components/components-core@0.6.0');
    assert.equal(doc.readme, '# FormInfo\n\nfrom build');
    assert.equal(doc.version, '0.6.0');
    assert.equal(doc.packageName, '@kne-components/components-core');
    assert.match(doc.readmeUrl, /build\/README\.md$/);
  });

  it('缺少 build/README.md 时应失败', async () => {
    const packageDir = path.join(tempDir, 'package-empty');
    await fs.ensureDir(packageDir);
    await fs.writeFile(path.join(packageDir, 'README.md'), '# root only');

    Module._load = function (request, parent, isMain) {
      if (request === '@kne/fetch-npm-package') {
        return async (name, version, options) => {
          await options.callback(packageDir);
        };
      }
      return originalLoad(request, parent, isMain);
    };

    delete require.cache[require.resolve('../lib/getRemoteComponentReadmeFromTarball')];
    const getRemoteComponentReadmeFromTarball = require('../lib/getRemoteComponentReadmeFromTarball');

    await assert.rejects(() => getRemoteComponentReadmeFromTarball('@kne-components/x'), /不存在 build\/README\.md/);
  });
});
