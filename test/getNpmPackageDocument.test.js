const assert = require('node:assert/strict');
const getNpmPackageDocument = require('../lib/getNpmPackageDocument');

describe('getNpmPackageDocument', () => {
  it('packageName 为空时应抛错', async () => {
    await assert.rejects(() => getNpmPackageDocument(), /packageName 不能为空/);
    await assert.rejects(() => getNpmPackageDocument(''), /packageName 不能为空/);
  });

  it('应调用 loadNpmInfo 并返回 README 相关字段', async () => {
    const doc = await getNpmPackageDocument('@kne/md-doc@0.1.8', {
      loadNpmInfo: async (name) => {
        assert.equal(name, '@kne/md-doc@0.1.8');
        return {
          packageName: '@kne/md-doc',
          name: 'md-doc',
          version: '0.1.8',
          readme: '# md-doc',
          homepage: 'https://example.com',
          repository: { url: 'git+https://example.com' },
          distTags: { latest: '0.1.8' }
        };
      }
    });

    assert.deepEqual(doc, {
      packageName: '@kne/md-doc',
      name: 'md-doc',
      version: '0.1.8',
      readme: '# md-doc',
      homepage: 'https://example.com',
      repository: { url: 'git+https://example.com' },
      distTags: { latest: '0.1.8' }
    });
  });

  it('readme 缺失时应回落为空字符串', async () => {
    const doc = await getNpmPackageDocument('@kne/x', {
      loadNpmInfo: async () => ({
        packageName: '@kne/x',
        name: 'x',
        version: '1.0.0'
      })
    });
    assert.equal(doc.readme, '');
  });
});
