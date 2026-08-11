const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const getDocumentIndexDir = require('../lib/getDocumentIndexDir');
const { ENV_KEY } = getDocumentIndexDir;

describe('getDocumentIndexDir', () => {
  let tempDir;
  let prevEnv;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kne-doc-root-'));
    prevEnv = process.env[ENV_KEY];
    delete process.env[ENV_KEY];
  });

  afterEach(async () => {
    if (prevEnv === undefined) {
      delete process.env[ENV_KEY];
    } else {
      process.env[ENV_KEY] = prevEnv;
    }
    await fs.remove(tempDir);
  });

  it('应优先使用 overrideDir 并创建目录', async () => {
    const target = path.join(tempDir, 'override');
    const dir = await getDocumentIndexDir(target);
    assert.equal(dir, target);
    assert.ok(await fs.pathExists(target));
  });

  it('无 override 时应使用环境变量', async () => {
    const target = path.join(tempDir, 'env');
    process.env[ENV_KEY] = target;
    const dir = await getDocumentIndexDir();
    assert.equal(dir, target);
    assert.ok(await fs.pathExists(target));
  });

  it('无 override/环境变量时应回退到 ~/.kne_document_indexed', async () => {
    const dir = await getDocumentIndexDir();
    assert.equal(dir, path.join(os.homedir(), '.kne_document_indexed'));
    assert.ok(await fs.pathExists(dir));
  });
});
