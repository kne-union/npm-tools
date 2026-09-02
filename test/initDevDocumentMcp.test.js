const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const initDevDocumentMcp = require('../lib/initDevDocumentMcp');

const {
  parseArgs,
  normalizeUrl,
  resolveInitUrls,
  buildMcpServerEntry,
  writeKneDocumentConfig,
  mergeMcpConfigFile,
  installMcpTarget,
  MCP_SERVER_ID
} = initDevDocumentMcp;

const SYNC_URL = 'http://localhost:8061/api/v1';
const MCP_URL = 'http://localhost:8061/api/v1/mcp';

describe('initDevDocumentMcp', () => {
  let tempHome;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'init-dev-doc-mcp-'));
  });

  afterEach(async () => {
    await fs.remove(tempHome);
  });

  it('parseArgs 应解析 target/sync-url/mcp-url/token', () => {
    const args = parseArgs([
      '--target',
      'cursor',
      '--sync-url',
      SYNC_URL,
      '--mcp-url',
      MCP_URL,
      '--token',
      'abc123'
    ]);
    assert.equal(args.target, 'cursor');
    assert.equal(args.syncUrl, SYNC_URL);
    assert.equal(args.mcpUrl, MCP_URL);
    assert.equal(args.token, 'abc123');
  });

  it('parseArgs 应将 --api-url 视为 --sync-url 兼容别名', () => {
    const args = parseArgs(['--api-url', SYNC_URL]);
    assert.equal(args.syncUrl, SYNC_URL);
  });

  it('normalizeUrl 应去掉末尾斜杠', () => {
    assert.equal(normalizeUrl(`${SYNC_URL}/`, '--sync-url'), SYNC_URL);
  });

  it('resolveInitUrls 在未传 mcp-url 时应默认 sync-url/mcp', () => {
    assert.deepEqual(resolveInitUrls({ syncUrl: SYNC_URL, mcpUrl: '' }), {
      syncUrl: SYNC_URL,
      mcpUrl: MCP_URL
    });
  });

  it('buildMcpServerEntry 应使用完整 mcp-url', () => {
    assert.deepEqual(
      buildMcpServerEntry({
        mcpUrl: MCP_URL,
        token: 'token-value'
      }),
      {
        url: MCP_URL,
        headers: {
          'x-user-token': 'token-value'
        }
      }
    );
  });

  it('writeKneDocumentConfig 应写入 ~/.kne_document/config.json', async () => {
    const configPath = await writeKneDocumentConfig({
      syncUrl: SYNC_URL,
      mcpUrl: MCP_URL,
      token: 'token-value',
      homedir: tempHome
    });

    assert.equal(configPath, path.join(tempHome, '.kne_document', 'config.json'));
    const config = await fs.readJson(configPath);
    assert.deepEqual(config.remote, {
      syncUrl: SYNC_URL,
      mcpUrl: MCP_URL,
      apiUrl: SYNC_URL,
      token: 'token-value'
    });
  });

  it('writeKneDocumentConfig 应保留已有字段并更新 remote', async () => {
    const configPath = path.join(tempHome, '.kne_document', 'config.json');
    await fs.ensureDir(path.dirname(configPath));
    await fs.writeJson(configPath, { lastSyncAt: '2026-01-01T00:00:00.000Z', remote: { apiUrl: 'old' } });

    await writeKneDocumentConfig({
      syncUrl: SYNC_URL,
      mcpUrl: MCP_URL,
      token: 'new-token',
      homedir: tempHome
    });

    const config = await fs.readJson(configPath);
    assert.equal(config.lastSyncAt, '2026-01-01T00:00:00.000Z');
    assert.deepEqual(config.remote, {
      syncUrl: SYNC_URL,
      mcpUrl: MCP_URL,
      apiUrl: SYNC_URL,
      token: 'new-token'
    });
  });

  it('mergeMcpConfigFile 应合并已有 mcpServers', async () => {
    const configPath = path.join(tempHome, '.cursor', 'mcp.json');
    await fs.ensureDir(path.dirname(configPath));
    await fs.writeJson(configPath, {
      mcpServers: {
        figma: { url: 'https://mcp.figma.com/mcp' }
      }
    });

    await mergeMcpConfigFile({
      configPath,
      mcpUrl: MCP_URL,
      token: 'token-value'
    });

    const config = await fs.readJson(configPath);
    assert.deepEqual(config.mcpServers.figma, { url: 'https://mcp.figma.com/mcp' });
    assert.deepEqual(config.mcpServers[MCP_SERVER_ID], {
      url: MCP_URL,
      headers: { 'x-user-token': 'token-value' }
    });
  });

  it('initDevDocumentMcp 应同时写入 kne_document 与 cursor MCP 配置', async () => {
    const result = await initDevDocumentMcp(
      ['--target', 'cursor', '--sync-url', SYNC_URL, '--mcp-url', MCP_URL, '--token', 'token-value', '--skip-sync'],
      { homedir: tempHome }
    );

    assert.equal(result.target, 'cursor');
    assert.equal(result.syncUrl, SYNC_URL);
    assert.equal(result.mcpUrl, MCP_URL);
    assert.equal(result.configPath, path.join(tempHome, '.kne_document', 'config.json'));
    assert.equal(result.mcpConfigPath, path.join(tempHome, '.cursor', 'mcp.json'));

    const kneConfig = await fs.readJson(result.configPath);
    const mcpConfig = await fs.readJson(result.mcpConfigPath);
    assert.equal(kneConfig.remote.syncUrl, SYNC_URL);
    assert.equal(kneConfig.remote.mcpUrl, MCP_URL);
    assert.equal(kneConfig.remote.token, 'token-value');
    assert.equal(mcpConfig.mcpServers[MCP_SERVER_ID].url, MCP_URL);
  });

  it('initDevDocumentMcp 有待同步文件时应触发 syncAll', async () => {
    const filePath = path.join(tempHome, '.kne_document', 'worklog', 'demo', '2026-01-01-12-00-00', 'title.json');
    await fs.ensureDir(path.dirname(filePath));
    await fs.writeJson(filePath, { title: 'demo' });

    let uploadCount = 0;
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ code: 0, data: { action: 'created' } })
    });

    const result = await initDevDocumentMcp(
      ['--target', 'cursor', '--sync-url', SYNC_URL, '--mcp-url', MCP_URL, '--token', 'token-value'],
      {
        homedir: tempHome,
        fetchImpl: async (...args) => {
          uploadCount += 1;
          return fetchImpl(...args);
        },
        logger: () => {}
      }
    );

    assert.equal(result.syncSummary.synced, 1);
    assert.ok(uploadCount >= 1);
  });

  it('installMcpTarget 对未知 target 应抛错', async () => {
    await assert.rejects(
      () =>
        installMcpTarget({
          target: 'unknown',
          mcpUrl: MCP_URL,
          token: 'token-value',
          homedir: tempHome
        }),
      /不支持的 MCP 目标/
    );
  });
});
