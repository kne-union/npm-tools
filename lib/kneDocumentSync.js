const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const crypto = require('node:crypto');

const getPaths = homedir => {
  const root = path.join(homedir, '.kne_document');
  return {
    root,
    configPath: path.join(root, 'config.json'),
    registryPath: path.join(root, 'sync-registry.json')
  };
};

const loadJson = async filePath => {
  try {
    const raw = await fsp.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
};

const saveJson = async (filePath, data) => {
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

const emptyRegistry = () => ({ schemaVersion: 1, entries: {} });

const loadConfig = async homedir => {
  const { configPath } = getPaths(homedir);
  return (await loadJson(configPath)) || {};
};

const saveConfig = async (homedir, config) => {
  const { configPath } = getPaths(homedir);
  await saveJson(configPath, config);
};

const loadRegistry = async homedir => {
  const { registryPath } = getPaths(homedir);
  const registry = (await loadJson(registryPath)) || emptyRegistry();
  if (!registry.entries || typeof registry.entries !== 'object') {
    registry.entries = {};
  }
  registry.schemaVersion = 1;
  return registry;
};

const saveRegistry = async (homedir, registry) => {
  const { registryPath } = getPaths(homedir);
  await saveJson(registryPath, registry);
};

const hashContent = content => crypto.createHash('sha256').update(JSON.stringify(content)).digest('hex');

const resolveRemote = async ({ homedir = os.homedir(), apiUrl, token } = {}) => {
  const config = await loadConfig(homedir);
  return {
    config,
    apiUrl: apiUrl || config.remote?.apiUrl,
    token: token || config.remote?.token
  };
};

const walkJsonFiles = async homedir => {
  const { root } = getPaths(homedir);
  const roots = ['worklog', 'experience'];
  const files = [];

  for (const subdir of roots) {
    const baseDir = path.join(root, subdir);
    if (!fs.existsSync(baseDir)) {
      continue;
    }

    const walk = async currentDir => {
      const entries = await fsp.readdir(currentDir, { withFileTypes: true });
      for (const entry of entries) {
        const abs = path.join(currentDir, entry.name);
        if (entry.isDirectory()) {
          await walk(abs);
        } else if (entry.isFile() && entry.name.endsWith('.json')) {
          const relativePath = path.relative(root, abs).split(path.sep).join('/');
          const type = relativePath.startsWith('worklog/') ? 'worklog' : 'experience';
          files.push({ abs, relativePath, type });
        }
      }
    };

    await walk(baseDir);
  }

  return files;
};

const needsSync = ({ entry, apiUrl, contentHash, fileMtimeMs }) => {
  if (!entry) {
    return { needed: true, reason: 'never_synced' };
  }
  if (entry.apiUrl !== apiUrl) {
    return { needed: true, reason: 'api_url_changed' };
  }
  if (entry.contentHash && entry.contentHash !== contentHash) {
    return { needed: true, reason: 'content_changed' };
  }
  if (fileMtimeMs && entry.syncedAt && fileMtimeMs > Date.parse(entry.syncedAt)) {
    return { needed: true, reason: 'local_newer' };
  }
  return { needed: false, reason: 'up_to_date' };
};

const apiRequest = async ({ apiUrl, token, method, pathname, body, fetchImpl = fetch }) => {
  const url = new URL(pathname, apiUrl.endsWith('/') ? apiUrl : `${apiUrl}/`);
  const response = await fetchImpl(url, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'x-user-token': token
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok) {
    const message = data?.msg || data?.message || data?.error || response.statusText;
    throw new Error(`${method} ${url.pathname} failed (${response.status}): ${message}`);
  }
  return data?.data !== undefined ? data.data : data;
};

const uploadItem = async ({ apiUrl, token, type, relativePath, content, fetchImpl }) => {
  const uploadPath = type === 'worklog' ? '/worklog/upload' : '/experience/upload';
  return apiRequest({
    apiUrl,
    token,
    method: 'POST',
    pathname: uploadPath,
    body: { relativePath, content },
    fetchImpl
  });
};

const inspectFileSyncState = async ({ homedir, apiUrl, relativePath, registry }) => {
  const { root } = getPaths(homedir);
  const abs = path.join(root, relativePath);
  if (!fs.existsSync(abs)) {
    throw new Error(`本地文件不存在: ${relativePath}`);
  }

  const stat = await fsp.stat(abs);
  const raw = await fsp.readFile(abs, 'utf8');
  const content = JSON.parse(raw);
  const contentHash = hashContent(content);
  const entry = registry.entries[relativePath];
  const pending = needsSync({
    entry,
    apiUrl,
    contentHash,
    fileMtimeMs: stat.mtimeMs
  });

  return {
    relativePath,
    type: relativePath.startsWith('worklog/') ? 'worklog' : 'experience',
    content,
    contentHash,
    pending
  };
};

const listPendingSync = async ({ homedir = os.homedir(), apiUrl }) => {
  const registry = await loadRegistry(homedir);
  const files = await walkJsonFiles(homedir);
  const pending = [];

  for (const item of files) {
    const state = await inspectFileSyncState({
      homedir,
      apiUrl,
      relativePath: item.relativePath,
      registry
    });
    if (state.pending.needed) {
      pending.push({
        relativePath: item.relativePath,
        reason: state.pending.reason
      });
    }
  }

  return pending;
};

const syncOneFile = async ({
  homedir = os.homedir(),
  relativePath,
  apiUrl,
  token,
  dryRun = false,
  registry,
  fetchImpl = fetch,
  logger = console.log
}) => {
  const reg = registry || (await loadRegistry(homedir));
  const state = await inspectFileSyncState({
    homedir,
    apiUrl,
    relativePath,
    registry: reg
  });

  if (!state.pending.needed) {
    return { relativePath, action: 'skipped', reason: state.pending.reason };
  }

  if (dryRun) {
    return { relativePath, action: 'dry-run', reason: state.pending.reason };
  }

  const result = await uploadItem({
    apiUrl,
    token,
    type: state.type,
    relativePath,
    content: state.content,
    fetchImpl
  });
  reg.entries[relativePath] = {
    apiUrl,
    syncedAt: new Date().toISOString(),
    action: result.action || 'updated',
    contentHash: state.contentHash
  };
  await saveRegistry(homedir, reg);

  logger(`[${result.action || 'updated'}] ${relativePath} (${state.pending.reason})`);

  return {
    relativePath,
    action: result.action || 'updated',
    reason: state.pending.reason,
    apiUrl
  };
};

const syncAll = async ({
  homedir = os.homedir(),
  apiUrl,
  token,
  dryRun = false,
  force = false,
  fetchImpl = fetch,
  logger = console.log
} = {}) => {
  const registry = await loadRegistry(homedir);
  const files = await walkJsonFiles(homedir);
  const summary = { synced: 0, skipped: 0, failed: 0, pending: 0, errors: [] };

  for (const item of files) {
    try {
      if (force) {
        delete registry.entries[item.relativePath];
      }
      const result = await syncOneFile({
        homedir,
        relativePath: item.relativePath,
        apiUrl,
        token,
        dryRun,
        registry,
        fetchImpl,
        logger: dryRun ? () => {} : logger
      });
      if (result.action === 'skipped') {
        summary.skipped += 1;
      } else if (result.action === 'dry-run') {
        summary.pending += 1;
        logger(`[dry-run] ${item.relativePath} (${result.reason})`);
      } else {
        summary.synced += 1;
      }
    } catch (err) {
      summary.failed += 1;
      summary.errors.push({ relativePath: item.relativePath, message: err.message });
      logger(`[failed] ${item.relativePath}: ${err.message}`);
    }
  }

  if (!dryRun) {
    const config = await loadConfig(homedir);
    await saveConfig(
      homedir,
      Object.assign({}, config, {
        remote: Object.assign({}, config.remote, { apiUrl, token }),
        lastSyncApiUrl: apiUrl,
        lastSyncAt: new Date().toISOString()
      })
    );
  }

  return summary;
};

module.exports = {
  getPaths,
  loadConfig,
  saveConfig,
  loadRegistry,
  saveRegistry,
  walkJsonFiles,
  needsSync,
  resolveRemote,
  listPendingSync,
  syncOneFile,
  syncAll
};
