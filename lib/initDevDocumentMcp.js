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
  --api-url <url>     开发者文档服务 API 根地址，如 http://localhost:8061/api/v1
  --token <token>     登录 token（x-user-token）
  --skip-sync         跳过初始化后的本地数据同步
  --dry-run           仅预览待同步文件，不实际上传
  -h, --help          打印帮助说明

说明:
  - 写入 ~/.kne_document/config.json（remote.apiUrl + token）
  - 按目标合并 MCP 配置（cursor → ~/.cursor/mcp.json）
  - 检查本地 worklog / experience，若有待同步项则自动上传
`);
};

const parseArgs = argv => {
  const args = {
    target: '',
    apiUrl: '',
    token: '',
    skipSync: false,
    dryRun: false,
    help: false
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--target') args.target = argv[++i] || '';
    else if (key === '--api-url') args.apiUrl = argv[++i] || '';
    else if (key === '--token') args.token = argv[++i] || '';
    else if (key === '--skip-sync') args.skipSync = true;
    else if (key === '--dry-run') args.dryRun = true;
    else if (key === '--help' || key === '-h') args.help = true;
  }

  return args;
};

const normalizeApiUrl = apiUrl => {
  const trimmed = String(apiUrl || '').trim().replace(/\/+$/, '');
  if (!trimmed) {
    throw new Error('缺少 --api-url');
  }
  return trimmed;
};

const buildMcpServerEntry = ({ apiUrl, token }) => ({
  url: `${normalizeApiUrl(apiUrl)}/mcp`,
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

const writeKneDocumentConfig = async ({ apiUrl, token, homedir }) => {
  const { configPath } = getKneDocumentPaths(homedir);
  const existing = await readJsonObject(configPath, '~/.kne_document/config.json');
  const config = Object.assign({}, existing, {
    remote: Object.assign({}, existing.remote, {
      apiUrl: normalizeApiUrl(apiUrl),
      token
    })
  });
  await writeJsonFile(configPath, config);
  return configPath;
};

const mergeMcpConfigFile = async ({ configPath, apiUrl, token }) => {
  const existing = await readJsonObject(configPath, configPath);
  const merged = Object.assign({}, existing, {
    mcpServers: Object.assign({}, existing.mcpServers, {
      [MCP_SERVER_ID]: buildMcpServerEntry({ apiUrl, token })
    })
  });
  await writeJsonFile(configPath, merged);
  return configPath;
};

const installMcpTarget = async ({ target, apiUrl, token, homedir }) => {
  const targetConfig = MCP_TARGETS[target];
  if (!targetConfig) {
    throw new Error(`不支持的 MCP 目标: ${target}`);
  }
  const configPath = targetConfig.getConfigPath(homedir);
  await mergeMcpConfigFile({ configPath, apiUrl, token });
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

  const apiUrl = normalizeApiUrl(args.apiUrl);
  const token = String(args.token || '').trim();
  if (!token) {
    throw new Error('缺少 --token');
  }

  const configPath = await writeKneDocumentConfig({ apiUrl, token, homedir });
  const mcpConfigPath = await installMcpTarget({ target, apiUrl, token, homedir });

  console.log(`已写入 ${configPath}`);
  console.log(`已更新 MCP 配置 ${mcpConfigPath} (${target})`);

  let syncSummary = null;
  if (!args.skipSync) {
    const logger = options.logger || console.log;
    const { pending, invalidJson } = await kneDocumentSync.listPendingSync({ homedir, apiUrl, logger });
    if (invalidJson.length > 0) {
      console.warn(`跳过 ${invalidJson.length} 个 JSON 格式错误的本地文件（请修复 keyCode 等字段中的非法转义后再同步）`);
    }
    if (pending.length === 0) {
      console.log('本地 worklog / experience 无需同步');
    } else {
      console.log(`发现 ${pending.length} 个待同步文件，开始同步...`);
      syncSummary = await kneDocumentSync.syncAll({
        homedir,
        apiUrl,
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
    apiUrl,
    configPath,
    mcpConfigPath,
    syncSummary
  };
};

module.exports = Object.assign(initDevDocumentMcp, {
  MCP_SERVER_ID,
  MCP_TARGETS,
  parseArgs,
  normalizeApiUrl,
  buildMcpServerEntry,
  getKneDocumentPaths,
  writeKneDocumentConfig,
  mergeMcpConfigFile,
  installMcpTarget,
  printHelp
});
