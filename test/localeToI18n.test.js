const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const localeToI18n = require('../lib/localeToI18n');
const { parseArgs, flattenMessages, escapeTarget, buildContent } = localeToI18n;

describe('localeToI18n helpers', () => {
  it('parseArgs 应解析参数与默认 out', () => {
    const args = parseArgs(['--root', '/tmp/app', '--include-server', '--dry-run']);
    assert.equal(args.root, path.resolve('/tmp/app'));
    assert.equal(args.includeServer, true);
    assert.equal(args.dryRun, true);
    assert.equal(args.out, path.join(path.resolve('/tmp/app'), 'i18n-export'));
  });

  it('flattenMessages / escapeTarget / buildContent', () => {
    assert.deepEqual(flattenMessages({ a: { b: '1' }, c: '2' }), { 'a.b': '1', c: '2' });
    assert.equal(escapeTarget('say "hi"'), 'say \\"hi\\"');
    assert.equal(buildContent({ hello: 'world' }), 'hello="world"');
  });
});

describe('localeToI18n', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-tools-i18n-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('dry-run 应收集项目 locale 并不写文件', async () => {
    const localeDir = path.join(tempDir, 'src', 'locale');
    await fs.ensureDir(localeDir);
    await fs.writeJson(path.join(localeDir, 'zh-CN.json'), { hello: '你好' });
    await fs.writeJson(path.join(tempDir, 'package.json'), { name: 'demo', version: '1.0.0' });

    const result = await localeToI18n(['--root', tempDir, '--dry-run']);
    assert.ok(Array.isArray(result.outputs));
    assert.ok(result.outputs.length >= 1);
    const outDir = path.join(tempDir, 'i18n-export');
    assert.equal(await fs.pathExists(outDir), false);
  });
});
