const path = require('node:path');
const fs = require('fs-extra');
const downloadNpmPackage = require('@kne/fetch-npm-package');

const parsePackageSpec = packageSpec => {
  const raw = String(packageSpec || '').trim();
  if (!raw) {
    return { packageName: '', version: undefined };
  }
  if (raw.startsWith('@')) {
    const at = raw.lastIndexOf('@');
    if (at > 0) {
      return { packageName: raw.slice(0, at), version: raw.slice(at + 1) || undefined };
    }
    return { packageName: raw, version: undefined };
  }
  const [packageName, version] = raw.split('@');
  return { packageName, version: version || undefined };
};

/**
 * 从 npm tarball 读取远程组件文档：仅 package/build/README.md（禁止 registry readme / 包根 README）
 * @param {string} packageSpec 包名，可带版本如 @kne-components/components-core@0.6.0
 * @param {string} [version] 显式版本（优先于 packageSpec 内版本）
 * @returns {Promise<{ packageName: string, version: string, readme: string, readmeUrl: string }>}
 */
const getRemoteComponentReadmeFromTarball = async (packageSpec, version) => {
  const parsed = parsePackageSpec(packageSpec);
  const packageName = parsed.packageName;
  const targetVersion = version || parsed.version;
  if (!packageName) {
    throw new Error('packageName 不能为空');
  }

  let readme = '';
  let resolvedVersion = targetVersion || '';

  await downloadNpmPackage(packageName, targetVersion, {
    callback: async packageDir => {
      const readmePath = path.join(packageDir, 'build', 'README.md');
      if (!(await fs.pathExists(readmePath))) {
        throw new Error(`远程组件 tarball 中不存在 build/README.md: ${packageName}@${targetVersion || 'latest'}`);
      }
      readme = await fs.readFile(readmePath, 'utf8');
      if (!String(readme).trim()) {
        throw new Error(`远程组件 build/README.md 为空: ${packageName}@${targetVersion || 'latest'}`);
      }
      try {
        const pkg = await fs.readJson(path.join(packageDir, 'package.json'));
        resolvedVersion = pkg.version || resolvedVersion;
      } catch (e) {
        // ignore
      }
    }
  });

  return {
    packageName,
    version: resolvedVersion || targetVersion || 'latest',
    readme,
    readmeUrl: `npm-tarball://${packageName}/build/README.md`
  };
};

module.exports = getRemoteComponentReadmeFromTarball;
module.exports.parsePackageSpec = parsePackageSpec;
