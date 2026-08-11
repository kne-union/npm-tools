const loadNpmInfo = require('@kne/load-npm-info');

/**
 * 通过 @kne/load-npm-info 获取 npm 包 README.md
 * @param {string} packageName 包名，可带版本如 @kne/md-doc@0.1.8
 * @returns {Promise<{ packageName: string, name: string, version: string, readme: string, homepage?: any, repository?: any, distTags?: object }>}
 */
const getNpmPackageDocument = async (packageName, options = {}) => {
  if (!packageName || typeof packageName !== 'string') {
    throw new Error('packageName 不能为空');
  }
  const load = options.loadNpmInfo || loadNpmInfo;
  const info = await load(packageName);
  return {
    packageName: info.packageName,
    name: info.name,
    version: info.version,
    readme: info.readme || '',
    homepage: info.homepage,
    repository: info.repository,
    distTags: info.distTags
  };
};

module.exports = getNpmPackageDocument;
