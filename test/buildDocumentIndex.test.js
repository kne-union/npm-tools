const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const buildDocumentIndex = require('../lib/buildDocumentIndex');
const { buildCatalogFromReadme, extractDocMd, stripHtml } = buildDocumentIndex;

describe('buildCatalogFromReadme', () => {
  it('应从 DOC_MD 段按 # 切分组件并解析 api', () => {
    const catalog = buildCatalogFromReadme(
      [
        '前置忽略',
        '<!--START_SECTION:DOC_MD-->',
        '# DemoComp',
        '',
        '### 概述',
        '',
        'demo summary',
        '',
        '### API',
        '',
        '| 属性 | 说明 |',
        '| --- | --- |',
        '| value | 值 |',
        '',
        '<!--END_SECTION:DOC_MD-->'
      ].join('\n'),
      'demo-remote'
    );

    assert.equal(catalog.index.length, 1);
    assert.equal(catalog.index[0].token, 'demo-remote:DemoComp');
    assert.ok(catalog.components.DemoComp);
    assert.match(String(catalog.components.DemoComp.api), /value/);
  });

  it('无 DOC_MD 标记时使用全文', () => {
    const catalog = buildCatalogFromReadme('# Only\n\n### 概述\n\nhi\n', 'pkg');
    assert.equal(catalog.index.length, 1);
    assert.equal(catalog.index[0].name, 'Only');
  });

  it('extractDocMd / stripHtml 辅助行为正确', () => {
    assert.equal(extractDocMd(''), '');
    assert.equal(extractDocMd('plain'), 'plain');
    assert.equal(stripHtml('<b>a</b>  <i>b</i>'), 'a b');
  });
});

describe('buildDocumentIndex', () => {
  let tempDir;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'kne-doc-index-'));
  });

  afterEach(async () => {
    await fs.remove(tempDir);
  });

  it('应写入 meta/index/components.json', async () => {
    const built = await buildDocumentIndex({
      id: 'demo-remote',
      version: '1.0.0',
      readme: '# DemoComp\n\n### 概述\n\nhello\n',
      source: 'test',
      outputDir: tempDir
    });

    assert.equal(built.root, tempDir);
    assert.ok(await fs.pathExists(path.join(built.dir, 'index.json')));
    assert.ok(await fs.pathExists(path.join(built.dir, 'components.json')));
    assert.ok(await fs.pathExists(path.join(built.dir, 'meta.json')));
    const meta = await fs.readJson(path.join(built.dir, 'meta.json'));
    assert.equal(meta.id, 'demo-remote');
    assert.equal(meta.version, '1.0.0');
  });

  it('缺少 id 或 readme 时应抛错', async () => {
    await assert.rejects(() => buildDocumentIndex({ readme: '# x' }), /需要 id/);
    await assert.rejects(() => buildDocumentIndex({ id: 'x' }), /需要 readme/);
  });
});
