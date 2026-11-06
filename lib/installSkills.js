const os = require('os');
const path = require('path');
const crypto = require('crypto');
const fs = require('fs-extra');

const SCHEMA_VERSION = 1;
const TARGET_VALUES = ['cursor', 'workbuddy'];
const MANIFEST_RELATIVE_PATH = '.kne_document/skill-install-manifest.json';
const MEMORY_PATH_PATTERN = /^~\/\.workbuddy\/user-[^/]+-personal\/MEMORY\.md$/;

const sha256 = value => `sha256:${crypto.createHash('sha256').update(String(value), 'utf8').digest('hex')}`;

const expandHomePath = (filePath, homedir) => path.resolve(homedir, filePath.slice(2));

/**
 * 服务端返回的路径必须落在白名单根目录内，禁止 ../、绝对路径、反斜杠与软链接逃逸。
 */
const resolveSafePath = (filePath, homedir) => {
  if (typeof filePath !== 'string' || !filePath.startsWith('~/')) {
    throw new Error(`非法安装路径（必须以 ~/ 开头）：${filePath}`);
  }
  const relative = filePath.slice(2);
  if (!relative || relative.includes('..') || relative.includes('\\') || path.isAbsolute(relative)) {
    throw new Error(`非法安装路径：${filePath}`);
  }
  const segments = relative.split('/').filter(Boolean);
  const allowed =
    (segments[0] === '.cursor' && (segments[1] === 'rules' || segments[1] === 'skills')) ||
    (segments[0] === '.workbuddy' && segments[1] === 'skills');
  if (!allowed || segments.length < 3 || segments.some(segment => !/^[A-Za-z0-9._-]+$/.test(segment))) {
    throw new Error(`安装路径越过允许范围：${filePath}`);
  }
  const absolute = expandHomePath(filePath, homedir);
  const root = path.resolve(homedir);
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    throw new Error(`安装路径越过用户目录：${filePath}`);
  }
  return absolute;
};

/** --skills-dir 只覆盖 skills 目录，且必须先通过默认白名单校验 */
const resolveInstallPath = (item, homedir, skillsDir) => {
  const safe = resolveSafePath(item.path, homedir);
  if (!skillsDir) {
    return safe;
  }
  const marker = '/skills/';
  const index = item.path.indexOf(marker);
  if (index < 0) {
    return safe;
  }
  const root = path.resolve(skillsDir);
  const absolute = path.resolve(root, item.path.slice(index + marker.length));
  if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
    throw new Error(`安装路径越过 --skills-dir：${item.path}`);
  }
  return absolute;
};

const assertContentHash = (item, label) => {
  if (!item.contentHash || sha256(item.content || '') !== item.contentHash) {
    throw new Error(`${label} 的 contentHash 与内容不一致，拒绝写入`);
  }
};

const validateManifest = ({ manifest, target }) => {
  if (!manifest || typeof manifest !== 'object') {
    throw new Error('安装清单为空');
  }
  if (manifest.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(`不支持的安装清单版本：${manifest.schemaVersion}`);
  }
  if (target && manifest.target !== target) {
    throw new Error(`安装清单目标不匹配：期望 ${target}，实际 ${manifest.target}`);
  }
  if (!Array.isArray(manifest.files)) {
    throw new Error('安装清单缺少 files 数组');
  }
  return manifest;
};

const fetchInstallManifest = async ({ syncUrl, token, target, params = {}, fetchImpl = fetch }) => {
  if (!TARGET_VALUES.includes(target)) {
    throw new Error(`不支持的安装目标：${target}`);
  }
  const base = String(syncUrl || '').trim().replace(/\/+$/, '');
  if (!base) {
    throw new Error('缺少 --sync-url');
  }
  if (!token) {
    throw new Error('缺少 --token');
  }
  const url = new URL(`${base}/skill/export`);
  url.searchParams.set('target', target);
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') {
      url.searchParams.set(key, String(value));
    }
  });
  const response = await fetchImpl(url.toString(), {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`
    }
  });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(`获取技能安装清单失败 (${response.status}): ${text.slice(0, 300)}`);
  }
  const payload = await response.json();
  const manifest = payload && payload.data !== undefined ? payload.data : payload;
  return validateManifest({ manifest, target });
};

const escapeRegExp = value => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 只替换 marker 之间的托管区块，其余内容逐字节保留。
 * marker 重复 / 缺失一半 / 顺序异常都直接拒绝写入，避免破坏用户手写内容。
 */
const mergeManagedBlock = (original, blockContent, blockId) => {
  const begin = `<!-- BEGIN managed:${blockId} -->`;
  const end = `<!-- END managed:${blockId} -->`;
  const beginCount = original.split(begin).length - 1;
  const endCount = original.split(end).length - 1;
  if (beginCount === 0 && endCount === 0) {
    // 新建的 MEMORY.md 是空文件，不要在开头留下空行
    const separator = !original ? '' : original.endsWith('\n') ? '\n' : '\n\n';
    return `${original}${separator}${blockContent}\n`;
  }
  if (beginCount !== 1 || endCount !== 1) {
    throw new Error(`MEMORY.md 托管区块标记重复或不完整（${blockId}），拒绝写入`);
  }
  const pattern = new RegExp(`${escapeRegExp(begin)}[\\s\\S]*?${escapeRegExp(end)}`);
  if (!pattern.test(original)) {
    throw new Error(`MEMORY.md 托管区块标记顺序异常（${blockId}），拒绝写入`);
  }
  return original.replace(pattern, () => blockContent);
};

/**
 * 用户级 MEMORY.md 目录名带账号 UUID，服务端只给 glob，由本机解析。
 * - 恰好 1 个账号目录：直接返回该目录下的 MEMORY.md 路径，文件不存在时由调用方新建。
 * - 多个账号目录：只认已存在的 MEMORY.md 且必须唯一，避免把规则写进错误账号。
 * - 找不到账号目录：返回 null 告警跳过，绝不猜测 UUID 凭空创建目录。
 */
const resolveMemoryFilePath = async ({ homedir, manifestPath }) => {
  if (!MEMORY_PATH_PATTERN.test(String(manifestPath || ''))) {
    return null;
  }
  const workbuddyDir = path.join(homedir, '.workbuddy');
  if (!(await fs.pathExists(workbuddyDir))) {
    return null;
  }
  const entries = await fs.readdir(workbuddyDir);
  const accountDirs = [];
  for (const name of entries.filter(item => /^user-.*-personal$/.test(item))) {
    const dir = path.join(workbuddyDir, name);
    const stat = await fs.stat(dir).catch(() => null);
    if (stat && stat.isDirectory()) {
      accountDirs.push(dir);
    }
  }
  if (accountDirs.length === 1) {
    return path.join(accountDirs[0], 'MEMORY.md');
  }
  const existing = [];
  for (const dir of accountDirs) {
    const file = path.join(dir, 'MEMORY.md');
    if (await fs.pathExists(file)) {
      existing.push(file);
    }
  }
  return existing.length === 1 ? existing[0] : null;
};

const getManifestPath = homedir => path.join(homedir, MANIFEST_RELATIVE_PATH);

const backupFile = async filePath => {
  if (!(await fs.pathExists(filePath))) {
    return null;
  }
  const backupPath = `${filePath}.bak.${Date.now()}`;
  await fs.copy(filePath, backupPath);
  return backupPath;
};

const atomicWrite = async (filePath, content) => {
  await fs.ensureDir(path.dirname(filePath));
  const tempPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  try {
    await fs.writeFile(tempPath, content, 'utf8');
    await fs.rename(tempPath, filePath);
  } finally {
    if (await fs.pathExists(tempPath)) {
      await fs.remove(tempPath);
    }
  }
};

const installFile = async ({ item, homedir, dryRun, summary, skillsDir }) => {
  const label = `技能文件 ${item.name}`;
  assertContentHash(item, label);
  const absolute = resolveInstallPath(item, homedir, skillsDir); // 越界直接抛出，整体拒绝
  const existing = (await fs.pathExists(absolute)) ? await fs.readFile(absolute, 'utf8') : null;
  if (existing !== null && sha256(existing) === item.contentHash) {
    summary.skipped += 1;
    return { path: item.path, status: 'skipped' };
  }
  if (dryRun) {
    summary.skipped += 1;
    return { path: item.path, status: 'dry-run' };
  }
  const backupPath = await backupFile(absolute);
  if (backupPath) {
    summary.backedUp += 1;
  }
  await atomicWrite(absolute, item.content);
  summary.installed += 1;
  return { path: item.path, status: 'installed', backupPath };
};

const installMemoryBlock = async ({ block, homedir, dryRun, summary }) => {
  const label = `托管区块 ${block.blockId}`;
  assertContentHash(block, label);
  if (block.strategy !== 'replace-managed-block' || block.scope !== 'user') {
    throw new Error(`不支持的托管区块策略：${block.strategy} / ${block.scope}`);
  }
  if (!MEMORY_PATH_PATTERN.test(String(block.path || ''))) {
    throw new Error(`托管区块路径越过允许范围：${block.path}`);
  }
  if (block.degraded) {
    summary.warnings.push('MEMORY.md 托管区块超出字符预算，已降级为精简索引；完整规则请查看技能文件。');
  }
  const absolute = await resolveMemoryFilePath({ homedir, manifestPath: block.path });
  if (!absolute) {
    summary.warnings.push('无法定位唯一的用户级 MEMORY.md（账号目录缺失或多账号存在歧义），已跳过托管区块写入（技能文件仍已安装）。');
    summary.skipped += 1;
    return { path: block.path, status: 'skipped', reason: 'memory-not-found' };
  }
  const existed = await fs.pathExists(absolute);
  const original = existed ? await fs.readFile(absolute, 'utf8') : '';
  const merged = mergeManagedBlock(original, block.content, block.blockId);
  if (merged === original) {
    summary.skipped += 1;
    return { path: absolute, status: 'skipped' };
  }
  if (dryRun) {
    summary.skipped += 1;
    return { path: absolute, status: 'dry-run' };
  }
  const backupPath = await backupFile(absolute);
  if (backupPath) {
    summary.backedUp += 1;
  }
  await atomicWrite(absolute, merged);
  summary.installed += 1;
  return { path: absolute, status: 'installed', created: !existed, backupPath };
};

/**
 * 把服务端安装清单落盘。单条失败只记 warning，不中断其它条目、不回滚已写入的 MCP 配置。
 */
const installSkills = async ({ manifest, target, homedir = os.homedir(), dryRun = false, logger = () => {}, skillsDir }) => {
  validateManifest({ manifest, target });
  const summary = { installed: 0, skipped: 0, backedUp: 0, failed: 0, warnings: [] };
  const files = [];
  const memoryBlocks = [];

  for (const item of manifest.files) {
    try {
      files.push(await installFile({ item, homedir, dryRun, summary, skillsDir }));
    } catch (error) {
      summary.failed += 1;
      summary.warnings.push(`${item.path}: ${error.message}`);
      logger(`⚠️  跳过 ${item.path}: ${error.message}`);
    }
  }

  for (const block of manifest.memoryBlocks || []) {
    try {
      memoryBlocks.push(await installMemoryBlock({ block, homedir, dryRun, summary }));
    } catch (error) {
      summary.failed += 1;
      summary.warnings.push(`${block.path}: ${error.message}`);
      logger(`⚠️  跳过 ${block.path}: ${error.message}`);
    }
  }

  const installedManifest = {
    schemaVersion: SCHEMA_VERSION,
    target: manifest.target,
    generatedAt: manifest.generatedAt,
    installedAt: new Date().toISOString(),
    dryRun: !!dryRun,
    files,
    memoryBlocks,
    summary
  };
  if (!dryRun) {
    const manifestPath = getManifestPath(homedir);
    await fs.ensureDir(path.dirname(manifestPath));
    await fs.writeJson(manifestPath, installedManifest, { spaces: 2 });
    installedManifest.manifestPath = manifestPath;
  }
  return installedManifest;
};

const printHelp = () => {
  console.log(`Usage:
  npx @kne/npm-tools installSkills [options]

Options:
  --target <name>     安装目标：cursor | workbuddy（必填）
  --sync-url <url>    REST 同步根地址，如 http://host/api/v1
  --token <token>     长期令牌（Authorization: Bearer）
  --type <type>       只导出 rule | skill
  --name <name>       只导出指定标识
  --category <value>  只导出指定分类
  --dry-run           仅预览，不写任何文件
  -h, --help          打印帮助说明
`);
};

const parseCliArgs = argv => {
  const args = { params: {}, dryRun: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--target') args.target = argv[++i] || '';
    else if (key === '--sync-url' || key === '--api-url') args.syncUrl = argv[++i] || '';
    else if (key === '--token') args.token = argv[++i] || '';
    else if (key === '--type') args.params.type = argv[++i] || '';
    else if (key === '--name') args.params.name = argv[++i] || '';
    else if (key === '--category') args.params.category = argv[++i] || '';
    else if (key === '--dry-run') args.dryRun = true;
    else if (key === '--help' || key === '-h') args.help = true;
  }
  return args;
};

const runCli = async (argv, options = {}) => {
  const args = parseCliArgs(argv);
  if (args.help) {
    printHelp();
    return { help: true };
  }
  const manifest = await fetchInstallManifest({
    syncUrl: args.syncUrl,
    token: args.token,
    target: args.target,
    params: args.params,
    fetchImpl: options.fetchImpl
  });
  const result = await installSkills({
    manifest,
    target: args.target,
    homedir: options.homedir || os.homedir(),
    dryRun: args.dryRun
  });
  console.log(
    `技能安装${args.dryRun ? '（预览）' : ''}：安装 ${result.summary.installed}，跳过 ${result.summary.skipped}，备份 ${result.summary.backedUp}，失败 ${result.summary.failed}`
  );
  result.summary.warnings.forEach(warning => console.warn(`⚠️  ${warning}`));
  if (!args.dryRun) {
    console.log('规则写入 MEMORY.md 后需新建会话才会生效。');
  }
  return result;
};

module.exports = Object.assign(installSkills, {
  installSkills,
  SCHEMA_VERSION,
  TARGET_VALUES,
  MANIFEST_RELATIVE_PATH,
  MEMORY_PATH_PATTERN,
  sha256,
  expandHomePath,
  resolveSafePath,
  resolveInstallPath,
  assertContentHash,
  validateManifest,
  fetchInstallManifest,
  mergeManagedBlock,
  resolveMemoryFilePath,
  getManifestPath,
  backupFile,
  atomicWrite,
  installFile,
  installMemoryBlock,
  parseCliArgs,
  printHelp,
  runCli
});
