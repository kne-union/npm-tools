const jsdom = require('jsdom');
const fs = require('fs-extra');
const path = require('path');
const ensureSlash = require('@kne/ensure-slash');
const lodash = require('lodash');

const { JSDOM } = jsdom;

const formatRemote = remote => remote.replace(/[-/.@]/g, '_');

// entry-cn-prod.html → remote-module-config-cn-prod.json；entry.html / index.html → remote-module-config.json
const getRemoteModuleConfigPath = outputHtmlPath => {
  if (process.env.REMOTE_MODULE_CONFIG_PATH) {
    return path.resolve(process.cwd(), process.env.REMOTE_MODULE_CONFIG_PATH);
  }
  const base = path.basename(outputHtmlPath, path.extname(outputHtmlPath));
  const matched = base.match(/^(?:entry|index)(.*)$/);
  const suffix = matched ? matched[1] : `-${base}`;
  return path.join(path.dirname(outputHtmlPath), `remote-module-config${suffix}.json`);
};

// remote-loader 以 formatRemote(`${remote}_${version}`) 作为容器全局变量名，version 须与构建产物的容器名一致
const buildRemoteModuleConfig = async ({ buildDir, baseUrl }) => {
  const manifestPath = path.resolve(buildDir, 'asset-manifest.json');
  if (!(await fs.pathExists(manifestPath))) {
    return null;
  }
  const { files = {} } = await fs.readJson(manifestPath);
  const containerFile = Object.keys(files).find(key => /\.js$/.test(key) && /(^|\/)remoteEntry\.js$/.test(files[key]));
  if (!containerFile) {
    return null;
  }
  const containerName = containerFile.replace(/\.js$/, '');
  const packageJsonPath = path.resolve(process.cwd(), 'package.json');
  const packageJson = (await fs.pathExists(packageJsonPath)) ? await fs.readJson(packageJsonPath) : {};
  const name = process.env.COMPONENTS_NAME || packageJson.name || '';
  const prefix = name ? `${formatRemote(name)}_` : '';
  const version = prefix && containerName.indexOf(prefix) === 0 ? containerName.slice(prefix.length) : process.env.CURRENT_VERSION || packageJson.version || '';
  return {
    name,
    url: baseUrl,
    tpl: '{{url}}',
    version
  };
};

const generateEntryHtml = async () => {
  if (!process.env.DEPLOY_URL) {
    console.error('未正确设置DEPLOY_URL');
    return;
  }

  const appName = '/' + (process.env.APP_NAME || '').replace(/^\//, '');

  const compiled = lodash.template(ensureSlash(process.env.DEPLOY_URL), { interpolate: /{{([\s\S]+?)}}/g });

  const baseUrl = compiled({ APP_NAME: process.env.APP_NAME || '', VERSION: process.env.VERSION || '' });

  const replaceUrlsTask = [{
    origin: ensureSlash(appName, true), target: `${baseUrl}/`
  }, {
    origin: 'static/js', target: `${baseUrl}/static/js`
  }, {
    origin: 'remoteEntry.js', target: `${baseUrl}/remoteEntry.js`
  }];
  console.log('replaceUrlsTask:', JSON.stringify(replaceUrlsTask));

  const indexPath = path.resolve(process.cwd(), process.env.INDEX_HTML_PATH || 'build/index.html');
  const indexFile = await fs.readFile(indexPath);
  const dom = new JSDOM(indexFile);
  const { window } = dom;
  [].forEach.call(window.document.head.children, (el) => {
    ['src', 'href'].forEach((attr) => {
      const attrValue = el.getAttribute(attr);
      replaceUrlsTask.forEach(({ origin, target }) => {
        if ((attrValue || '').indexOf(origin) === 0) {
          el.setAttribute(attr, attrValue.replace(origin, target));
        }
      });
    });
  });
  let innerHTML = `window.runtimeAppName='${process.env.APP_NAME || ''}';window.runtimePublicUrl='${baseUrl}';window.runtimeApiUrl='${process.env.API_URL || ''}';`;
  if (process.env?.RUNTIME_ENV) {
    console.log('RUNTIME_ENV:', process.env?.RUNTIME_ENV);
    innerHTML = innerHTML + 'window.runtimeEnv = {};';
    process.env.RUNTIME_ENV.split(';').filter((str) => !!str).forEach(item => {
      const splitIndex = item.indexOf(':');
      innerHTML = innerHTML + `window.runtimeEnv["${item.slice(0, splitIndex).trim()}"] = "${item.slice(+splitIndex + 1)}";`;
    });
  }
  const scriptEl = window.document.createElement('script');
  scriptEl.innerHTML = innerHTML;
  window.document.head.appendChild(scriptEl);

  const output = dom.serialize();
  console.log('生成结果:', output);

  const outputPath = path.resolve(process.cwd(), process.env.OUTPUT_HTML_PATH || 'build/index.html');

  await fs.writeFile(outputPath, output);

  const remoteModuleConfig = await buildRemoteModuleConfig({ buildDir: path.dirname(indexPath), baseUrl });
  if (!remoteModuleConfig) {
    console.log('未在 asset-manifest.json 中找到 remoteEntry.js，跳过生成 remote-module-config');
    return;
  }
  const remoteModuleConfigPath = getRemoteModuleConfigPath(outputPath);
  await fs.writeJson(remoteModuleConfigPath, remoteModuleConfig, { spaces: 2 });
  console.log('remote-module-config:', remoteModuleConfigPath, JSON.stringify(remoteModuleConfig));
};

module.exports = generateEntryHtml;
module.exports.buildRemoteModuleConfig = buildRemoteModuleConfig;
module.exports.getRemoteModuleConfigPath = getRemoteModuleConfigPath;
