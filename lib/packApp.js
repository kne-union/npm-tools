const path = require('node:path');
const os = require('node:os');
const { execFileSync } = require('node:child_process');
const fs = require('fs-extra');
const JSZip = require('jszip');
const { resolveRemote, resolveApiUrl } = require('./kneDocumentSync');

const HELP = `Usage:
  npx @kne/npm-tools packApp [options]

将全栈 / 后端业务应用打成应用中心部署包（zip）：先检查包结构，通过后再打包。

若存在 server/menus.json（应用菜单集成声明），一并按应用中心规则检查（remote.name 与应用 name 一致、组件目录与权限码存在等）
包内容：package.json、build/、server/（排除 node_modules、.env*、.git、server/build、日志与本地 sqlite 库）
项目在 git 仓库内时，server/ 下被 .gitignore 忽略的未跟踪文件也会排除；build/ 是构建产物，不受 .gitignore 影响

Options:
  --dir <path>        项目根目录，默认当前目录
  --out <file>        输出 zip 路径，默认 <tmp>/kne-app-package/<name>-<version>.zip
  --name <name>       应用中心中的应用 name，默认取根 package.json 的 name（去掉 scope）
  --version <ver>     版本号，默认取根 package.json 的 version
  --upload            打包后上传到 developer-document（读取 ~/.kne_document/config.json），输出 fileId
  --api-url <url>     覆盖 config.json 中的 remote.apiUrl
  --token <token>     覆盖 config.json 中的 remote.token（长期令牌）
  -h, --help          打印帮助说明

上传成功后，用 MCP upload_app_version（name、version、fileId）登记版本，再 deploy_app 部署。
`;

const ENTRY_CANDIDATES = ['index.html', 'entry.html', 'entry-prod.html'];
const ENV_SCHEMA_FILE = 'env.schema.json';
const MENUS_FILE = 'menus.json';
const MENU_INTEGRATIONS = ['remote', 'iframe', 'blank'];
const MENU_KEY_RE = /^[a-z0-9][a-z0-9-]*$/;
const MENU_COMPONENT_RE = /^[A-Za-z][A-Za-z0-9_]*$/;
const MENU_MAX_DEPTH = 2;
const SQL_FILE_NAME_RE = /^[A-Za-z0-9_\-.]+\.sql$/;
const JSON_TYPES = ['string', 'number', 'integer', 'boolean', 'object', 'array', 'null'];
const EXCLUDED_NAMES = new Set(['node_modules', '.git', '.DS_Store']);
const EXCLUDED_FILE_RE = [/^\.env(\..*)?$/, /\.log$/, /\.(db|sqlite|sqlite3)(-journal)?$/];

const parseArgs = argv => {
  const args = { dir: '', out: '', name: '', version: '', upload: false, apiUrl: '', token: '', help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--dir') args.dir = argv[++i] || '';
    else if (key === '--out') args.out = argv[++i] || '';
    else if (key === '--name') args.name = argv[++i] || '';
    else if (key === '--version') args.version = argv[++i] || '';
    else if (key === '--upload') args.upload = true;
    else if (key === '--api-url' || key === '--sync-url') args.apiUrl = argv[++i] || '';
    else if (key === '--token') args.token = argv[++i] || '';
    else if (key === '--help' || key === '-h') args.help = true;
  }
  return args;
};

const toAppName = pkgName =>
  String(pkgName || '')
    .replace(/^@[^/]+\//, '')
    .toLowerCase();

const readJsonSafe = async file => {
  try {
    return { data: await fs.readJson(file), error: null };
  } catch (e) {
    return { data: null, error: e.message };
  }
};

/** 与应用中心 env.schema.json 规范一致的结构检查（完整 ajv 编译由服务端完成） */
const checkEnvSchema = schema => {
  const errors = [];
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) {
    return [`server/${ENV_SCHEMA_FILE} must be a JSON object`];
  }
  if (schema.type !== 'object') {
    errors.push(`server/${ENV_SCHEMA_FILE}: "type" must be "object"`);
  }
  const properties = schema.properties;
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) {
    errors.push(`server/${ENV_SCHEMA_FILE}: "properties" must be an object`);
  } else {
    for (const [key, prop] of Object.entries(properties)) {
      if (!prop || typeof prop !== 'object' || Array.isArray(prop)) {
        errors.push(`server/${ENV_SCHEMA_FILE}: properties.${key} must be an object`);
        continue;
      }
      const types = prop.type === undefined ? [] : [].concat(prop.type);
      const invalid = types.filter(type => !JSON_TYPES.includes(type));
      if (invalid.length) {
        errors.push(`server/${ENV_SCHEMA_FILE}: properties.${key}.type has invalid value ${invalid.join(', ')}`);
      }
    }
  }
  if (schema.required !== undefined) {
    if (!Array.isArray(schema.required) || schema.required.some(key => typeof key !== 'string')) {
      errors.push(`server/${ENV_SCHEMA_FILE}: "required" must be an array of strings`);
    } else if (properties && typeof properties === 'object') {
      const undeclared = schema.required.filter(key => !Object.prototype.hasOwnProperty.call(properties, key));
      if (undeclared.length) {
        errors.push(`server/${ENV_SCHEMA_FILE}: required keys not declared in properties: ${undeclared.join(', ')}`);
      }
    }
  }
  return errors;
};

/** 收集 server/libs/permissions.js 声明的全部权限码及其模块前缀（用 : 连接），读取失败返回 null */
const collectPermissionCodes = serverDir => {
  const file = path.join(serverDir, 'libs/permissions.js');
  if (!fs.pathExistsSync(file)) {
    return new Set();
  }
  let tree;
  try {
    delete require.cache[require.resolve(file)];
    tree = require(file);
  } catch (e) {
    return null;
  }
  const codes = new Set();
  const walk = (nodes, prefix) =>
    (Array.isArray(nodes) ? nodes : []).forEach(node => {
      const path = [...prefix, node.code];
      codes.add(path.join(':'));
      (node.permissions || []).forEach(permission => codes.add([...path, permission.code].join(':')));
      walk(node.modules, path);
    });
  walk(tree && tree.modules, []);
  return codes;
};

/** server/menus.json（应用菜单集成声明）检查，规则与应用中心 center/menus 拉取时的校验一致；文件不存在不算错误 */
const checkMenus = async (rootDir, { appName, rootPkg } = {}) => {
  const errors = [];
  const warnings = [];
  const file = path.join(rootDir, 'server', MENUS_FILE);
  if (!(await fs.pathExists(file))) {
    return { errors, warnings, menus: null };
  }
  const label = `server/${MENUS_FILE}`;
  const { data: manifest, error } = await readJsonSafe(file);
  if (error) {
    return { errors: [`${label} is not valid JSON: ${error}`], warnings, menus: null };
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
    return { errors: [`${label} must be a JSON object`], warnings, menus: null };
  }
  if (manifest.schemaVersion !== undefined && Number(manifest.schemaVersion) !== 1) {
    return { errors: [`${label}: unsupported schemaVersion ${manifest.schemaVersion}`], warnings, menus: null };
  }

  const hasRemote = !!manifest.remote && typeof manifest.remote === 'object';
  const integration = String(manifest.integration || '').trim() || (hasRemote ? 'remote' : 'iframe');
  if (!MENU_INTEGRATIONS.includes(integration)) {
    errors.push(`${label}: "integration" must be one of ${MENU_INTEGRATIONS.join(', ')}`);
  }
  const slug = appName || toAppName(rootPkg && rootPkg.name);
  const componentsDir = path.join(rootDir, 'src/components');

  if (integration === 'remote') {
    const remoteName = String((manifest.remote && manifest.remote.name) || '').trim();
    if (!remoteName) {
      errors.push(`${label}: "remote.name" is required when integration is remote`);
    } else if (slug && remoteName !== slug) {
      errors.push(`${label}: "remote.name" must equal the app slug (${slug}), got ${remoteName}`);
    }
    const preset = String((manifest.remote && manifest.remote.preset) || '').trim() || 'ComponentPreset';
    if (!(await fs.pathExists(path.join(componentsDir, preset)))) {
      errors.push(`${label}: remote preset component src/components/${preset} does not exist`);
    }
  }

  if (!Array.isArray(manifest.menus)) {
    errors.push(`${label}: "menus" must be an array`);
    return { errors, warnings, menus: null };
  }

  const permissionCodes = collectPermissionCodes(path.join(rootDir, 'server'));
  if (permissionCodes === null) {
    warnings.push(`server/libs/permissions.js could not be loaded, menu permission codes were not checked`);
  }

  const leaves = [];
  const walk = async (list, depth, parentKeys) => {
    const seen = new Set();
    for (const [index, item] of list.entries()) {
      const where = `${label}: menus[${[...parentKeys, index].join('.')}]`;
      if (!item || typeof item !== 'object' || Array.isArray(item)) {
        errors.push(`${where} must be an object`);
        continue;
      }
      const key = String(item.key || '').trim();
      if (!MENU_KEY_RE.test(key)) {
        errors.push(`${where}.key must match ${MENU_KEY_RE}`);
        continue;
      }
      if (seen.has(key)) {
        errors.push(`${where}.key is duplicated among siblings: ${key}`);
      }
      seen.add(key);
      if (!String(item.label || '').trim()) {
        errors.push(`${where}.label is required`);
      }
      const permission = String(item.permission || '').trim();
      if (permission && permissionCodes && !permissionCodes.has(permission)) {
        errors.push(`${where}.permission "${permission}" is not declared in server/libs/permissions.js`);
      }
      const children = Array.isArray(item.children) ? item.children : [];
      if (children.length) {
        if (depth >= MENU_MAX_DEPTH) {
          errors.push(`${where} exceeds ${MENU_MAX_DEPTH} menu levels`);
        } else if (item.component || item.path) {
          errors.push(`${where} has children, it must not declare component / path`);
        } else {
          await walk(children, depth + 1, [...parentKeys, index]);
        }
        continue;
      }
      leaves.push(key);
      if (integration === 'remote') {
        const component = String(item.component || '').trim();
        if (!MENU_COMPONENT_RE.test(component)) {
          errors.push(`${where}.component must be a directory name under src/components`);
        } else if (!(await fs.pathExists(path.join(componentsDir, component)))) {
          errors.push(`${where}.component src/components/${component} does not exist`);
        }
      } else if (!String(item.path || '').trim()) {
        errors.push(`${where}.path is required when integration is ${integration}`);
      }
    }
  };
  await walk(manifest.menus, 1, []);
  if (!leaves.length && !errors.length) {
    warnings.push(`${label} declares no menus, the app will only appear in the app center`);
  }
  return { errors, warnings, menus: manifest };
};

const findLocalDependencies = pkg =>
  ['dependencies', 'optionalDependencies']
    .flatMap(field => Object.entries((pkg && pkg[field]) || {}))
    .filter(([, spec]) => /^(file|link):/.test(String(spec)))
    .map(([name, spec]) => `${name}@${spec}`);

/** 检查项目是否满足应用中心部署包要求；返回 { ok, errors, warnings, rootPkg, envSchema, sqlFiles } */
const checkAppPackage = async (rootDir, { appName } = {}) => {
  const errors = [];
  const warnings = [];
  const serverDir = path.join(rootDir, 'server');
  const buildDir = path.join(rootDir, 'build');

  let rootPkg = null;
  if (!(await fs.pathExists(path.join(rootDir, 'package.json')))) {
    errors.push('missing root package.json');
  } else {
    const { data, error } = await readJsonSafe(path.join(rootDir, 'package.json'));
    if (error) errors.push(`package.json is not valid JSON: ${error}`);
    rootPkg = data;
  }

  if (!(await fs.pathExists(path.join(serverDir, 'package.json')))) {
    errors.push('missing server/package.json');
  } else {
    const { data, error } = await readJsonSafe(path.join(serverDir, 'package.json'));
    if (error) {
      errors.push(`server/package.json is not valid JSON: ${error}`);
    } else {
      const local = findLocalDependencies(data);
      if (local.length) {
        errors.push(`server/package.json has local dependencies that cannot be installed on the app center: ${local.join(', ')}`);
      }
    }
  }
  if (!(await fs.pathExists(path.join(serverDir, 'index.js')))) {
    errors.push('missing server/index.js');
  }

  if (!(await fs.pathExists(buildDir))) {
    errors.push('missing root build/ directory (run the frontend build first)');
  } else {
    const hasEntry = (await Promise.all(ENTRY_CANDIDATES.map(name => fs.pathExists(path.join(buildDir, name))))).some(Boolean);
    if (!hasEntry) {
      errors.push(`build/ must contain one of: ${ENTRY_CANDIDATES.join(', ')}`);
    }
  }

  let envSchema = null;
  const schemaFile = path.join(serverDir, ENV_SCHEMA_FILE);
  if (!(await fs.pathExists(schemaFile))) {
    errors.push(`missing server/${ENV_SCHEMA_FILE}`);
  } else {
    const { data, error } = await readJsonSafe(schemaFile);
    if (error) {
      errors.push(`server/${ENV_SCHEMA_FILE} is not valid JSON: ${error}`);
    } else {
      const schemaErrors = checkEnvSchema(data);
      errors.push(...schemaErrors);
      envSchema = schemaErrors.length ? null : data;
    }
  }

  let sqlFiles = [];
  const sqlDir = path.join(serverDir, 'sql');
  if (await fs.pathExists(sqlDir)) {
    sqlFiles = (await fs.readdir(sqlDir)).filter(name => name.endsWith('.sql')).sort();
    const invalid = sqlFiles.filter(name => !SQL_FILE_NAME_RE.test(name) || name.includes('..'));
    if (invalid.length) {
      errors.push(`invalid sql file names (use [A-Za-z0-9_-.] and end with .sql): ${invalid.join(', ')}`);
    }
  }

  if (rootPkg && !rootPkg.version) {
    warnings.push('root package.json has no version, use --version to set it');
  }

  const menuCheck = await checkMenus(rootDir, { appName, rootPkg });
  errors.push(...menuCheck.errors);
  warnings.push(...menuCheck.warnings);

  return { ok: errors.length === 0, errors, warnings, rootPkg, envSchema, sqlFiles, menus: menuCheck.menus };
};

const isExcluded = (relativePath, name) => {
  if (EXCLUDED_NAMES.has(name)) return true;
  if (relativePath === 'server/build') return true;
  return EXCLUDED_FILE_RE.some(re => re.test(name));
};

const collectFiles = async (rootDir, relativeDir, files = []) => {
  const entries = await fs.readdir(path.join(rootDir, relativeDir), { withFileTypes: true });
  for (const entry of entries) {
    const relativePath = path.posix.join(relativeDir, entry.name);
    if (isExcluded(relativePath, entry.name)) continue;
    if (entry.isDirectory()) {
      await collectFiles(rootDir, relativePath, files);
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
};

/** 按 git 规则（嵌套 .gitignore、.git/info/exclude、全局 excludes）去掉被忽略的文件，已跟踪文件不受影响；不在 git 仓库或没有 git 时返回 null */
const filterGitIgnored = (rootDir, files) => {
  if (!files.length) return files;
  let output;
  try {
    output = execFileSync('git', ['check-ignore', '--stdin', '-z'], {
      cwd: rootDir,
      input: `${files.join('\0')}\0`,
      stdio: ['pipe', 'pipe', 'ignore'],
      maxBuffer: 64 * 1024 * 1024
    });
  } catch (e) {
    // exit 1: none of the paths is ignored
    if (e.status === 1) return files;
    return null;
  }
  const ignored = new Set(output.toString('utf8').split('\0').filter(Boolean));
  const required = new Set(['server/package.json', 'server/index.js', `server/${ENV_SCHEMA_FILE}`]);
  return files.filter(file => required.has(file) || !ignored.has(file));
};

/** 打 zip：根目录直接包含 package.json、build/、server/ */
const createAppZip = async ({ rootDir, out }) => {
  const serverFiles = await collectFiles(rootDir, 'server');
  const gitFiltered = filterGitIgnored(rootDir, serverFiles);
  const files = ['package.json', ...(await collectFiles(rootDir, 'build')), ...(gitFiltered || serverFiles)];
  const zip = new JSZip();
  for (const file of files) {
    zip.file(file, await fs.readFile(path.join(rootDir, file)));
  }
  const buffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
  await fs.ensureDir(path.dirname(out));
  await fs.writeFile(out, buffer);
  return { out, size: buffer.length, fileCount: files.length, gitIgnoredCount: gitFiltered ? serverFiles.length - gitFiltered.length : null };
};

const uploadAppPackage = async ({ file, name, version, apiUrl, token, fetchImpl = fetch }) => {
  const form = new FormData();
  form.append('name', name);
  if (version) form.append('version', version);
  form.append('file', new Blob([await fs.readFile(file)], { type: 'application/zip' }), path.basename(file));
  const url = resolveApiUrl(apiUrl, '/app-package/upload');
  const response = await fetchImpl(url, { method: 'POST', headers: { 'x-user-token': token }, body: form });
  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }
  if (!response.ok || (data && data.code !== undefined && data.code !== 0)) {
    const message = data?.msg || data?.message || data?.error || response.statusText;
    throw new Error(`POST ${new URL(url).pathname} failed (${response.status}): ${message}`);
  }
  return data?.data !== undefined ? data.data : data;
};

const packApp = async (argv = [], { cwd = process.cwd(), homedir = os.homedir(), fetchImpl, logger = console } = {}) => {
  const args = parseArgs(argv);
  if (args.help) {
    logger.log(HELP);
    return null;
  }
  const rootDir = path.resolve(cwd, args.dir || '.');

  logger.log(`检查应用包：${rootDir}`);
  const check = await checkAppPackage(rootDir, { appName: args.name });
  check.warnings.forEach(item => logger.warn(`警告：${item}`));
  if (!check.ok) {
    throw new Error(`应用包检查未通过：\n${check.errors.map(item => `  - ${item}`).join('\n')}`);
  }
  const envKeys = Object.keys(check.envSchema.properties || {});
  logger.log(`检查通过：声明环境变量 ${envKeys.length} 个，必填 ${(check.envSchema.required || []).length} 个；SQL 脚本 ${check.sqlFiles.length} 个`);

  const name = args.name || toAppName(check.rootPkg.name);
  const version = args.version || check.rootPkg.version || '';
  if (!name) {
    throw new Error('无法确定应用 name，请使用 --name 指定');
  }
  const out = args.out ? path.resolve(cwd, args.out) : path.join(os.tmpdir(), 'kne-app-package', `${name}-${version || Date.now()}.zip`);
  const packed = await createAppZip({ rootDir, out });
  if (packed.gitIgnoredCount === null) {
    logger.warn('警告：项目不在 git 仓库内（或未安装 git），server/ 未按 .gitignore 过滤');
  } else if (packed.gitIgnoredCount > 0) {
    logger.log(`按 .gitignore 排除 server/ 下 ${packed.gitIgnoredCount} 个文件`);
  }
  logger.log(`打包完成：${packed.out}（${packed.fileCount} 个文件，${(packed.size / 1024 / 1024).toFixed(2)} MB）`);

  const result = { name, version, out: packed.out, size: packed.size, fileCount: packed.fileCount, fileId: null };
  if (!args.upload) {
    return result;
  }

  const remote = await resolveRemote({ homedir, apiUrl: args.apiUrl, token: args.token });
  if (!remote.apiUrl || !remote.token) {
    throw new Error('缺少上传地址或令牌：请先执行 npx @kne/npm-tools initDevDocumentMcp，或传入 --api-url 与 --token');
  }
  logger.log(`上传到 ${remote.apiUrl} ...`);
  const uploaded = await uploadAppPackage({ file: packed.out, name, version, apiUrl: remote.apiUrl, token: remote.token, fetchImpl });
  result.fileId = uploaded.fileId;
  logger.log(`上传完成：fileId=${uploaded.fileId}`);
  logger.log(`下一步：MCP upload_app_version { name: "${name}", version: "${version}", fileId: "${uploaded.fileId}" }，再 deploy_app`);
  return result;
};

module.exports = packApp;
module.exports.HELP = HELP;
module.exports.parseArgs = parseArgs;
module.exports.checkEnvSchema = checkEnvSchema;
module.exports.checkAppPackage = checkAppPackage;
module.exports.checkMenus = checkMenus;
module.exports.createAppZip = createAppZip;
module.exports.uploadAppPackage = uploadAppPackage;
module.exports.toAppName = toAppName;
