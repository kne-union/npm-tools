const path = require('path');
const os = require('os');
const fs = require('fs-extra');

const ENV_KEY = 'KNE_DOCUMENT_INDEXED_DIR';

/**
 * 文档索引输出根目录：环境变量 KNE_DOCUMENT_INDEXED_DIR，否则 ~/.kne_document_indexed
 * 目录不存在时会创建。
 * @param {string} [overrideDir]
 * @returns {Promise<string>}
 */
const getDocumentIndexDir = async (overrideDir) => {
  const dir =
    (overrideDir && String(overrideDir).trim()) ||
    (process.env[ENV_KEY] && String(process.env[ENV_KEY]).trim()) ||
    path.join(os.homedir(), '.kne_document_indexed');
  await fs.ensureDir(dir);
  return dir;
};

module.exports = getDocumentIndexDir;
module.exports.ENV_KEY = ENV_KEY;
