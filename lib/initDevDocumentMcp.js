const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const kneDocumentSync = require('./kneDocumentSync');

const MCP_SERVER_ID = 'developer-document';

const MCP_TARGETS = {
  cursor: {
    label: 'Cursor',
    getConfigPath: homedir => path.join(homedir, '.cursor', 'mcp.json')
  }
};

const printHelp = () => {
  console.log(`Usage:
  npx @kne/npm-tools initDevDocumentMcp [options]

Options:
  --target <name>     MCP 安装目标（目前支持 cursor；缺省时交互选择）
  --sync-url <url>    worklog / experience 同步 API 根地址（REST 上传）
  --mcp-url <url>     HTTP MCP 端点完整地址；缺省时为 <sync-url>/mcp
  --token <token>     登录 token（x-user-token）
  --skip-sync         跳过初始化后的本地数据同步
  --dry-run           仅预览待同步文件，不实际上传
  -h, --help          打印帮助说明

说明:
  - 写入 ~/.kne_document/config.json（remote.syncUrl、mcpUrl、token）
  - 按目标合并 MCP 配置（cursor → ~/.cursor/mcp.json）
  - 检查本地 worklog / experience，若有待同步项则自动上传
`);
};

const parseArgs = argv => {
  const args = {
    target: '',
    syncUrl: '',
    mcpUrl: '',
    token: '',
    skipSync: false,
    dryRun: false,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--target') args.target = argv[++i] || '';
    else if (key === '--sync-url' || key === '--api-url') args.syncUrl = argv[++i] || '';
    else if (key === '--mcp-url') args.mcpUrl = argv[++i] || '';
    else if (key === '--token') args.token = argv[++i] || '';
    else if (key === '--skip-sync') args.skipSync = true;
    else if (key === '--dry-run') args.dryRun = true;
    else if (key === '--help' || key === '-h') args.help = true;
  }

  return args;
};

const normalizeUrl = (url, flagName) => {
  const trimmed = String(url || '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new Error(`缺少 ${flagName}`);
  }
  return trimmed;
};

const resolveInitUrls = args => {
  const syncUrl = normalizeUrl(args.syncUrl, '--sync-url');
  const mcpUrl = normalizeUrl(args.mcpUrl || `${syncUrl}/mcp`, '--mcp-url');
  return { syncUrl, mcpUrl };
};

/** @deprecated 使用 normalizeUrl */
const normalizeApiUrl = url => normalizeUrl(url, '--sync-url');

const buildMcpServerEntry = ({ mcpUrl, token }) => ({
  url: normalizeUrl(mcpUrl, '--mcp-url'),
  headers: {
    'x-user-token': token
  }
});

const getKneDocumentPaths = homedir => {
  const root = path.join(homedir, '.kne_document');
  return {
    root,
    configPath: path.join(root, 'config.json')
  };
};

const writeJsonFile = async (filePath, data) => {
  await fs.ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

const readJsonObject = async (filePath, label = filePath) => {
  if (!(await fs.pathExists(filePath))) {
    return {};
  }
  try {
    return await fs.readJson(filePath);
  } catch (error) {
    throw new Error(`无法解析 ${label}：${error.message}`);
  }
};

const writeKneDocumentConfig = async ({ syncUrl, mcpUrl, token, homedir }) => {
  const { configPath } = getKneDocumentPaths(homedir);
  const existing = await readJsonObject(configPath, '~/.kne_document/config.json');
  const normalizedSyncUrl = normalizeUrl(syncUrl, '--sync-url');
  const normalizedMcpUrl = normalizeUrl(mcpUrl, '--mcp-url');
  const config = Object.assign({}, existing, {
    remote: Object.assign({}, existing.remote, {
      syncUrl: normalizedSyncUrl,
      mcpUrl: normalizedMcpUrl,
      apiUrl: normalizedSyncUrl,
      token
    })
  });
  await writeJsonFile(configPath, config);
  return configPath;
};

const mergeMcpConfigFile = async ({ configPath, mcpUrl, token }) => {
  const existing = await readJsonObject(configPath, configPath);
  const merged = Object.assign({}, existing, {
    mcpServers: Object.assign({}, existing.mcpServers, {
      [MCP_SERVER_ID]: buildMcpServerEntry({ mcpUrl, token })
    })
  });
  await writeJsonFile(configPath, merged);
  return configPath;
};

const installMcpTarget = async ({ target, mcpUrl, token, homedir }) => {
  const targetConfig = MCP_TARGETS[target];
  if (!targetConfig) {
    throw new Error(`不支持的 MCP 目标: ${target}`);
  }
  const configPath = targetConfig.getConfigPath(homedir);
  await mergeMcpConfigFile({ configPath, mcpUrl, token });
  return configPath;
};

const initDevDocumentMcp = async (argv, options = {}) => {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return { help: true };
  }

  const homedir = options.homedir || os.homedir();
  let target = args.target;
  if (!target) {
    const prompt = options.prompt;
    if (!prompt) {
      throw new Error('缺少 --target');
    }
    target = await prompt({
      message: '请选择 MCP 安装目标',
      choices: Object.entries(MCP_TARGETS).map(([value, meta]) => ({
        name: meta.label,
        value
      }))
    });
  }

  const { syncUrl, mcpUrl } = resolveInitUrls(args);
  const token = String(args.token || '').trim();
  if (!token) {
    throw new Error('缺少 --token');
  }

  const configPath = await writeKneDocumentConfig({ syncUrl, mcpUrl, token, homedir });
  const mcpConfigPath = await installMcpTarget({ target, mcpUrl, token, homedir });

  console.log(`已写入 ${configPath}`);
  console.log(`已更新 MCP 配置 ${mcpConfigPath} (${target})`);

  let syncSummary = null;
  if (!args.skipSync) {
    const logger = options.logger || console.log;
    const { pending, invalidJson } = await kneDocumentSync.listPendingSync({ homedir, syncUrl, logger });
    if (invalidJson.length > 0) {
      console.warn(`跳过 ${invalidJson.length} 个 JSON 格式错误的本地文件（请修复 keyCode 等字段中的非法转义后再同步）`);
    }
    if (pending.length === 0) {
      console.log('本地 worklog / experience 无需同步');
    } else {
      console.log(`发现 ${pending.length} 个待同步文件，开始同步...`);
      syncSummary = await kneDocumentSync.syncAll({
        homedir,
        syncUrl,
        token,
        dryRun: args.dryRun,
        fetchImpl: options.fetchImpl,
        logger
      });
      console.log(
        `同步完成：上传 ${syncSummary.synced}，跳过 ${syncSummary.skipped}，JSON 错误 ${syncSummary.invalidJson}，上传失败 ${syncSummary.failed}${
          args.dryRun ? `，待同步 ${syncSummary.pending}` : ''
        }`
      );
      if (syncSummary.failed > 0) {
        console.warn('部分文件上传失败，MCP 与 config 已配置完成，请检查网络或服务端后重试 sync');
      }
    }
  }

  return {
    target,
    syncUrl,
    mcpUrl,
    configPath,
    mcpConfigPath,
    syncSummary
  };
};

module.exports = Object.assign(initDevDocumentMcp, {
  MCP_SERVER_ID,
  MCP_TARGETS,
  parseArgs,
  normalizeUrl,
  normalizeApiUrl,
  resolveInitUrls,
  buildMcpServerEntry,
  getKneDocumentPaths,
  writeKneDocumentConfig,
  mergeMcpConfigFile,
  installMcpTarget,
  printHelp
});
