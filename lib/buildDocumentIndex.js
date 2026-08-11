const path = require('path');
const fs = require('fs-extra');
const { parse: parseMdDoc } = require('@kne/md-doc');
const getDocumentIndexDir = require('./getDocumentIndexDir');

const DOC_MD_RE = /<!--START_SECTION:DOC_MD-->([\s\S]*?)<!--END_SECTION:DOC_MD-->/;

const stripHtml = (html) =>
  String(html || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const extractDocMd = (readme) => {
  if (!readme || typeof readme !== 'string') {
    return '';
  }
  const m = readme.match(DOC_MD_RE);
  return (m ? m[1] : readme).trim();
};

const splitComponentSections = (docMd) => {
  if (!docMd) {
    return [];
  }
  return docMd.split(/\n(?=# )/g).filter((s) => s.startsWith('# '));
};

/**
 * 将 README 按 DOC_MD / # 组件块切分，解析为 index + components（对齐 fastify-live-components-site catalog）
 * @param {string} readme
 * @param {string} id 索引用名（remote 名或包名）
 */
const buildCatalogFromReadme = (readme, id) => {
  const docMd = extractDocMd(readme);
  const sections = splitComponentSections(docMd);
  const index = [];
  const components = {};

  sections.forEach((section) => {
    let parsed;
    try {
      parsed = parseMdDoc(section);
    } catch {
      return;
    }
    const name = parsed.name || '';
    if (!name) {
      return;
    }
    const token = `${id}:${name}`;
    const summary = stripHtml(parsed.summary).slice(0, 400);
    index.push({ name, token, summary });
    components[name] = {
      name,
      token,
      summary: parsed.summary || '',
      api: parsed.api || '',
      examples: (parsed.example?.list || []).map((ex, i) => ({
        id: String(i),
        title: ex.title || `示例${i + 1}`,
        description: ex.description || '',
        code: ex.code || ''
      }))
    };
  });

  return { index, components };
};

/**
 * 切分 README 并写入索引目录
 * @param {object} options
 * @param {string} options.id 索引 id（如 components-core 或 @kne/md-doc）
 * @param {string} [options.version]
 * @param {string} options.readme
 * @param {string} [options.packageName]
 * @param {string} [options.source] npm | remote
 * @param {string} [options.readmeUrl]
 * @param {string} [options.outputDir] 覆盖环境变量 / 默认目录
 */
const buildDocumentIndex = async (options = {}) => {
  const id = options.id || options.remote || options.packageName;
  const version = options.version || 'latest';
  if (!id) {
    throw new Error('buildDocumentIndex 需要 id（或 remote / packageName）');
  }
  if (typeof options.readme !== 'string') {
    throw new Error('buildDocumentIndex 需要 readme 字符串');
  }

  const root = await getDocumentIndexDir(options.outputDir);
  const dir = path.join(root, id, version);
  await fs.ensureDir(dir);

  const { index, components } = buildCatalogFromReadme(options.readme, id);
  const meta = {
    id,
    packageName: options.packageName || null,
    version,
    source: options.source || null,
    readmeUrl: options.readmeUrl || null,
    builtAt: Date.now(),
    componentCount: index.length
  };

  await Promise.all([
    fs.writeJson(path.join(dir, 'meta.json'), meta, { spaces: 2 }),
    fs.writeJson(path.join(dir, 'index.json'), index, { spaces: 2 }),
    fs.writeJson(path.join(dir, 'components.json'), components, { spaces: 2 })
  ]);

  return { dir, root, meta, index, components };
};

module.exports = buildDocumentIndex;
module.exports.buildCatalogFromReadme = buildCatalogFromReadme;
module.exports.extractDocMd = extractDocMd;
module.exports.splitComponentSections = splitComponentSections;
module.exports.stripHtml = stripHtml;
