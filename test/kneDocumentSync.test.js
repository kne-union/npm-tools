const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const kneDocumentSync = require('../lib/kneDocumentSync');

describe('kneDocumentSync', () => {
  let tempHome;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'kne-doc-sync-'));
  });

  afterEach(async () => {
    await fs.remove(tempHome);
  });

  it('resolveApiUrl 应保留 api/v1 前缀', () => {
    assert.equal(
      kneDocumentSync.resolveApiUrl('http://localhost:8061/api/v1', '/worklog/upload'),
      'http://localhost:8061/api/v1/worklog/upload'
    );
  });

  it('listPendingSync 应识别未同步文件', async () => {
    const filePath = path.join(tempHome, '.kne_document', 'worklog', 'demo', '2026-01-01-12-00-00', 'title.json');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeJson(filePath, { title: 'demo' });

    const { pending } = await kneDocumentSync.listPendingSync({
      homedir: tempHome,
      apiUrl: 'http://localhost:8061/api/v1'
    });

    assert.equal(pending.length, 1);
    assert.equal(pending[0].relativePath, 'worklog/demo/2026-01-01-12-00-00/title.json');
    assert.equal(pending[0].reason, 'never_synced');
  });

  it('listPendingSync 应跳过 JSON 格式错误的文件', async () => {
    const goodPath = path.join(tempHome, '.kne_document', 'worklog', 'demo', 'good.json');
    const badPath = path.join(tempHome, '.kne_document', 'worklog', 'demo', 'bad.json');
    await fs.ensureDir(path.dirname(goodPath));
    await fs.writeJson(goodPath, { title: 'good' });
    await fs.writeFile(badPath, '{"title":"bad","code":"\\`invalid"}');

    const { pending, invalidJson } = await kneDocumentSync.listPendingSync({
      homedir: tempHome,
      apiUrl: 'http://localhost:8061/api/v1'
    });

    assert.equal(pending.length, 1);
    assert.equal(invalidJson.length, 1);
    assert.equal(invalidJson[0].relativePath, 'worklog/demo/bad.json');
  });

  it('syncAll 应上传待同步文件并写入 registry', async () => {
    const filePath = path.join(tempHome, '.kne_document', 'experience', 'business', 'demo', 'card.json');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeJson(filePath, { title: 'card' });

    const fetchImpl = async (url, options) => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ code: 0, data: { action: 'created' } })
    });

    const summary = await kneDocumentSync.syncAll({
      homedir: tempHome,
      apiUrl: 'http://localhost:8061/api/v1',
      token: 'token-value',
      fetchImpl,
      logger: () => {}
    });

    assert.equal(summary.synced, 1);
    assert.equal(summary.failed, 0);

    const registry = await kneDocumentSync.loadRegistry(tempHome);
    assert.ok(registry.entries['experience/business/demo/card.json']);
  });
});
