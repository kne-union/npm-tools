const ensureSlash = require('@kne/ensure-slash');
const { getStaticPath } = require('@kne/remote-loader');

const trimSlash = (url) => String(url || '').replace(/\/+$/, '');

const parentUrl = (url) => {
  const base = trimSlash(url);
  const idx = base.lastIndexOf('/');
  return idx > -1 ? base.slice(0, idx) : base;
};

const fetchText = async (url) => {
  const response = await fetch(url, {
    headers: { Accept: 'text/plain, text/markdown, */*' }
  });
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status} ${response.statusText}`);
    error.status = response.status;
    error.url = url;
    throw error;
  }
  return response.text();
};

/**
 * 根据 remote-loader 远程组件配置解析部署地址并拉取 README.md
 * @param {object} remote 与 remoteLoaderPreset remotes 项一致：{ url, remote, tpl?, defaultVersion?, version?, remoteEntryFileName? }
 * @returns {Promise<{ remote: string, version: string, publicPath: string, readmeUrl: string, readme: string }>}
 */
const getRemoteModuleDocument = async (remote = {}) => {
  const name = remote.remote || remote.name;
  const version = remote.version || remote.defaultVersion || 'latest';
  if (!remote.url || !name) {
    throw new Error('远程组件参数无效：需要 url 与 remote');
  }

  const publicPath = getStaticPath({
    url: remote.url,
    remote: name,
    version,
    tpl: remote.tpl
  });
  const base = trimSlash(publicPath);
  const candidates = [`${base}/README.md`, `${parentUrl(base)}/README.md`];

  let lastError;
  for (const readmeUrl of candidates) {
    try {
      const readme = await fetchText(readmeUrl);
      return {
        remote: name,
        version,
        publicPath: ensureSlash(base, true),
        readmeUrl,
        readme
      };
    } catch (e) {
      lastError = e;
      if (e.status && e.status !== 404) {
        break;
      }
    }
  }

  throw new Error(
    `获取远程组件[${name}@${version}] README 失败: ${candidates.join(' | ')} (${lastError && lastError.message})`
  );
};

module.exports = getRemoteModuleDocument;
module.exports.parentUrl = parentUrl;
module.exports.trimSlash = trimSlash;
module.exports.fetchText = fetchText;
