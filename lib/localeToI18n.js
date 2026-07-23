const fs = require('fs-extra');
const path = require('path');

const IGNORE_DIR_NAMES = new Set([
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.git',
  '.next',
  '.turbo',
  'storybook-static'
]);

const LOCALE_FILE_RE = /^([a-z]{2}(?:-[A-Za-z]{2})?)\.(js|jsx|ts|tsx|mjs|cjs|json)$/i;

const parseArgs = argv => {
  const args = {
    root: process.cwd(),
    out: '',
    includeServer: false,
    dryRun: false,
    help: false
  };
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--root') args.root = path.resolve(argv[++i] || '');
    else if (key === '--out') args.out = path.resolve(argv[++i] || '');
    else if (key === '--include-server') args.includeServer = true;
    else if (key === '--dry-run') args.dryRun = true;
    else if (key === '--help' || key === '-h') args.help = true;
    else if (!key.startsWith('-') && !args._positionalRoot) {
      // 兼容：localeToI18n <root> [out]
      args._positionalRoot = path.resolve(key);
      args.root = args._positionalRoot;
    } else if (!key.startsWith('-') && args._positionalRoot && !args._positionalOut) {
      args._positionalOut = path.resolve(key);
      args.out = args._positionalOut;
    }
  }
  if (!args.out) {
    args.out = path.join(args.root, 'i18n-export');
  }
  return args;
};

const walk = (dir, files = []) => {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (e) {
    return files;
  }
  for (const entry of entries) {
    if (IGNORE_DIR_NAMES.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, files);
    } else if (entry.isFile()) {
      files.push(full);
    }
  }
  return files;
};

const escapeTarget = target =>
  String(target == null ? '' : target)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"');

const flattenMessages = (input, prefix = '', out = {}) => {
  if (input == null || typeof input !== 'object' || Array.isArray(input)) {
    return out;
  }
  Object.entries(input).forEach(([key, value]) => {
    const nextKey = prefix ? `${prefix}.${key}` : key;
    if (value != null && typeof value === 'object' && !Array.isArray(value)) {
      flattenMessages(value, nextKey, out);
      return;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      out[nextKey] = String(value);
    }
  });
  return out;
};

const loadMessagesFromSource = (filePath, source) => {
  if (filePath.endsWith('.json')) {
    return flattenMessages(JSON.parse(source));
  }

  let code = source
    .replace(/^\uFEFF/, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

  code = code
    .replace(/^\s*import\s+[\s\S]*?;?\s*$/gm, '')
    .replace(/export\s+default\s+/, 'return ')
    .replace(/module\.exports\s*=\s*/, 'return ');

  if (!/\breturn\b/.test(code)) {
    code = `return (${code})`;
  }

  let messages;
  try {
    // eslint-disable-next-line no-new-func
    messages = new Function(code)();
  } catch (e) {
    throw new Error(`解析失败 ${filePath}: ${e.message}`);
  }
  return flattenMessages(messages);
};

const findWithLocaleFile = localeDir => {
  let dir = path.dirname(localeDir);
  while (dir && dir !== path.dirname(dir)) {
    const candidates = ['withLocale.js', 'withLocale.jsx', 'withLocale.ts', 'withLocale.tsx'];
    for (const name of candidates) {
      const full = path.join(dir, name);
      if (fs.existsSync(full)) return full;
    }
    dir = path.dirname(dir);
  }
  return null;
};

const readNamespace = withLocalePath => {
  if (!withLocalePath) return 'global';
  const source = fs.readFileSync(withLocalePath, 'utf8');
  const matched = source.match(/namespace\s*:\s*['"]([^'"]+)['"]/);
  return matched ? matched[1].trim() : 'global';
};

const collectLocalePacks = (root, { includeServer }) => {
  const files = walk(root);
  const packs = [];

  files.forEach(file => {
    const base = path.basename(file);
    const matched = base.match(LOCALE_FILE_RE);
    if (!matched) return;

    const parentName = path.basename(path.dirname(file));
    if (parentName !== 'locale') return;

    const rel = path.relative(root, file);
    if (!includeServer && (rel.startsWith(`server${path.sep}`) || rel.startsWith('server/'))) {
      return;
    }

    const locale = matched[1];
    const localeDir = path.dirname(file);
    const withLocalePath = findWithLocaleFile(localeDir);
    const namespace = readNamespace(withLocalePath);

    packs.push({
      file,
      locale,
      namespace,
      withLocalePath,
      relative: rel
    });
  });

  return packs;
};

const buildContent = messages =>
  Object.keys(messages)
    .sort((a, b) => a.localeCompare(b))
    .map(code => `${code}="${escapeTarget(messages[code])}"`)
    .join('\n');

/**
 * 将前端项目 locale 目录转为 .i18n 文件（IntlAdmin 导入格式）
 * @param {string[]|object} input argv 片段或选项
 */
const localeToI18n = async (input = []) => {
  let options;
  if (Array.isArray(input)) {
    options = parseArgs(input);
  } else {
    options = parseArgs([]);
    if (input.root) {
      options.root = path.resolve(input.root);
    }
    if (input.out) {
      options.out = path.resolve(input.out);
    }
    options.includeServer = !!input.includeServer;
    options.dryRun = !!input.dryRun;
    options.help = !!input.help;
  }

  if (!options.out) {
    options.out = path.join(options.root, 'i18n-export');
  }

  if (options.help) {
    console.log(`Usage:
  npx @kne/npm-tools localeToI18n [--root <dir>] [--out <dir>] [--include-server] [--dry-run]

  兼容：npx @kne/npm-tools localeToI18n <root> [out]

输出：
  {namespace}.{locale}.i18n
  每行 code="value"

命名空间：
  向上查找 withLocale 中的 namespace，缺省为 global
`);
    return { outputs: [], conflicts: [] };
  }

  if (!(await fs.pathExists(options.root))) {
    throw new Error(`root 不存在: ${options.root}`);
  }

  const packs = collectLocalePacks(options.root, options);
  if (packs.length === 0) {
    throw new Error('未找到 locale 语言包（**/locale/{locale}.{js,json,...}）');
  }

  const merged = new Map();
  const conflicts = [];

  for (const pack of packs) {
    const source = await fs.readFile(pack.file, 'utf8');
    const messages = loadMessagesFromSource(pack.file, source);
    const key = `${pack.namespace}\0${pack.locale}`;
    if (!merged.has(key)) {
      merged.set(key, {
        namespace: pack.namespace,
        locale: pack.locale,
        messages: {},
        sources: []
      });
    }
    const bucket = merged.get(key);
    bucket.sources.push(pack.relative);

    Object.entries(messages).forEach(([code, value]) => {
      if (Object.prototype.hasOwnProperty.call(bucket.messages, code) && bucket.messages[code] !== value) {
        conflicts.push({
          namespace: pack.namespace,
          locale: pack.locale,
          code,
          from: pack.relative,
          prev: bucket.messages[code],
          next: value
        });
      }
      bucket.messages[code] = value;
    });
  }

  if (!options.dryRun) {
    await fs.ensureDir(options.out);
  }

  const outputs = [];
  for (const bucket of merged.values()) {
    const filename = `${bucket.namespace}.${bucket.locale}.i18n`;
    const content = buildContent(bucket.messages);
    const outPath = path.join(options.out, filename);
    outputs.push({
      filename,
      outPath,
      count: Object.keys(bucket.messages).length,
      sources: bucket.sources
    });
    if (!options.dryRun) {
      await fs.writeFile(outPath, `${content}\n`, 'utf8');
    }
  }

  outputs.sort((a, b) => a.filename.localeCompare(b.filename));
  console.log(`root: ${options.root}`);
  console.log(`out:  ${options.out}${options.dryRun ? ' (dry-run)' : ''}`);
  console.log(`files: ${outputs.length}`);
  outputs.forEach(item => {
    console.log(`- ${item.filename}  keys=${item.count}  from=${item.sources.length}`);
  });

  if (conflicts.length > 0) {
    console.log(`\nconflicts: ${conflicts.length} (kept last)`);
    conflicts.slice(0, 20).forEach(item => {
      console.log(`  ${item.namespace}.${item.locale} ${item.code} <= ${item.from}`);
    });
    if (conflicts.length > 20) {
      console.log(`  ... and ${conflicts.length - 20} more`);
    }
  }

  return { outputs, conflicts, root: options.root, out: options.out };
};

module.exports = localeToI18n;
