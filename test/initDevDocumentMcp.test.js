const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const initDevDocumentMcp = require('../lib/initDevDocumentMcp');

const {
  parseArgs,
  normalizeApiUrl,
  buildMcpServerEntry,
  writeKneDocumentConfig,
  mergeMcpConfigFile,
  installMcpTarget,
  MCP_SERVER_ID
} = initDevDocumentMcp;

describe('initDevDocumentMcp', () => {
  let tempHome;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'init-dev-doc-mcp-'));
  });

  afterEach(async () => {
    await fs.remove(tempHome);
  });

  it('parseArgs 应解析 target/api-url/token', () => {
    const args = parseArgs([
      '--target',
      'cursor',
      '--api-url',
      'http://localhost:8061/api/v1',
      '--token',
      'abc123'
    ]);
    assert.equal(args.target, 'cursor');
    assert.equal(args.apiUrl, 'http://localhost:8061/api/v1');
    assert.equal(args.token, 'abc123');
  });

  it('normalizeApiUrl 应去掉末尾斜杠', () => {
    assert.equal(normalizeApiUrl('http://localhost:8061/api/v1/'), 'http://localhost:8061/api/v1');
  });

  it('buildMcpServerEntry 应生成 HTTP MCP 配置', () => {
    assert.deepEqual(
      buildMcpServerEntry({
        apiUrl: 'http://localhost:8061/api/v1',
        token: 'token-value'
      }),
      {
        url: 'http://localhost:8061/api/v1/mcp',
        headers: {
          'x-user-token': 'token-value'
        }
      }
    );
  });

  it('writeKneDocumentConfig 应写入 ~/.kne_document/config.json', async () => {
    const configPath = await writeKneDocumentConfig({
      apiUrl: 'http://localhost:8061/api/v1',
      token: 'token-value',
      homedir: tempHome
    });

    assert.equal(configPath, path.join(tempHome, '.kne_document', 'config.json'));
    const config = await fs.readJson(configPath);
    assert.deepEqual(config.remote, {
      apiUrl: 'http://localhost:8061/api/v1',
      token: 'token-value'
    });
  });

  it('writeKneDocumentConfig 应保留已有字段并更新 remote', async () => {
    const configPath = path.join(tempHome, '.kne_document', 'config.json');
    await fs.ensureDir(path.dirname(configPath));
    await fs.writeJson(configPath, { lastSyncAt: '2026-01-01T00:00:00.000Z', remote: { apiUrl: 'old' } });

    await writeKneDocumentConfig({
      apiUrl: 'http://localhost:8061/api/v1',
      token: 'new-token',
      homedir: tempHome
    });

    const config = await fs.readJson(configPath);
    assert.equal(config.lastSyncAt, '2026-01-01T00:00:00.000Z');
    assert.deepEqual(config.remote, {
      apiUrl: 'http://localhost:8061/api/v1',
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
      apiUrl: 'http://localhost:8061/api/v1',
      token: 'token-value'
    });

    const config = await fs.readJson(configPath);
    assert.deepEqual(config.mcpServers.figma, { url: 'https://mcp.figma.com/mcp' });
    assert.deepEqual(config.mcpServers[MCP_SERVER_ID], {
      url: 'http://localhost:8061/api/v1/mcp',
      headers: { 'x-user-token': 'token-value' }
    });
  });

  it('initDevDocumentMcp 应同时写入 kne_document 与 cursor MCP 配置', async () => {
    const result = await initDevDocumentMcp(
      ['--target', 'cursor', '--api-url', 'http://localhost:8061/api/v1', '--token', 'token-value'],
      { homedir: tempHome }
    );

    assert.equal(result.target, 'cursor');
    assert.equal(result.configPath, path.join(tempHome, '.kne_document', 'config.json'));
    assert.equal(result.mcpConfigPath, path.join(tempHome, '.cursor', 'mcp.json'));

    const kneConfig = await fs.readJson(result.configPath);
    const mcpConfig = await fs.readJson(result.mcpConfigPath);
    assert.equal(kneConfig.remote.token, 'token-value');
    assert.equal(mcpConfig.mcpServers[MCP_SERVER_ID].url, 'http://localhost:8061/api/v1/mcp');
  });

  it('installMcpTarget 对未知 target 应抛错', async () => {
    await assert.rejects(
      () =>
        installMcpTarget({
          target: 'unknown',
          apiUrl: 'http://localhost:8061/api/v1',
          token: 'token-value',
          homedir: tempHome
        }),
      /不支持的 MCP 目标/
    );
  });
});
