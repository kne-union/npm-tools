const assert = require('node:assert/strict');
const getRemoteModuleDocument = require('../lib/getRemoteModuleDocument');
const { parentUrl, trimSlash } = getRemoteModuleDocument;

describe('getRemoteModuleDocument helpers', () => {
  it('trimSlash / parentUrl', () => {
    assert.equal(trimSlash('https://a.com/b/'), 'https://a.com/b');
    assert.equal(parentUrl('https://a.com/r/1.0/build'), 'https://a.com/r/1.0');
  });
});

describe('getRemoteModuleDocument', () => {
  let originalFetch;

  beforeEach(() => {
    originalFetch = global.fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('参数缺少 url/remote 时应抛错', async () => {
    await assert.rejects(() => getRemoteModuleDocument({ url: 'https://x' }), /远程组件参数无效/);
    await assert.rejects(() => getRemoteModuleDocument({ remote: 'r' }), /远程组件参数无效/);
  });

  it('应解析 publicPath 并优先取同目录 README', async () => {
    const calls = [];
    global.fetch = async (url) => {
      calls.push(url);
      return {
        ok: true,
        text: async () => '# readme from build'
      };
    };

    const doc = await getRemoteModuleDocument({
      url: 'https://cdn.example.com',
      tpl: '{{url}}/components/@kne-components/{{remote}}/{{version}}/build',
      remote: 'components-core',
      defaultVersion: '0.5.33'
    });

    assert.equal(calls.length, 1);
    assert.match(calls[0], /\/build\/README\.md$/);
    assert.equal(doc.readme, '# readme from build');
    assert.equal(doc.remote, 'components-core');
    assert.equal(doc.version, '0.5.33');
    assert.match(doc.publicPath, /\/build\/?$/);
  });

  it('同目录 404 时应回退到上级目录 README', async () => {
    global.fetch = async (url) => {
      if (String(url).includes('/build/README.md')) {
        return { ok: false, status: 404, statusText: 'Not Found' };
      }
      return { ok: true, text: async () => '# parent readme' };
    };

    const doc = await getRemoteModuleDocument({
      url: 'https://cdn.example.com',
      tpl: '{{url}}/components/@kne-components/{{remote}}/{{version}}/build',
      remote: 'components-core',
      version: '0.5.33'
    });

    assert.equal(doc.readme, '# parent readme');
    assert.match(doc.readmeUrl, /\/0\.5\.33\/README\.md$/);
  });

  it('候选均失败时应抛错', async () => {
    global.fetch = async () => ({ ok: false, status: 404, statusText: 'Not Found' });

    await assert.rejects(
      () =>
        getRemoteModuleDocument({
          url: 'https://cdn.example.com',
          remote: 'components-core',
          defaultVersion: '0.0.1'
        }),
      /获取远程组件/
    );
  });
});
