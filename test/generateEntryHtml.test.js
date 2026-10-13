const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const generateEntryHtml = require('../lib/generateEntryHtml');

const { getRemoteModuleConfigPath } = generateEntryHtml;

const ENV_KEYS = ['DEPLOY_URL', 'OUTPUT_HTML_PATH', 'INDEX_HTML_PATH', 'API_URL', 'RUNTIME_ENV', 'APP_NAME', 'VERSION', 'COMPONENTS_NAME', 'CURRENT_VERSION', 'REMOTE_MODULE_CONFIG_PATH'];

const INDEX_HTML = '<!DOCTYPE html><html><head><script defer="defer" src="/static/js/main.js"></script></head><body><div id="root"></div></body></html>';

describe('generateEntryHtml remote-module-config', () => {
  let tempDir;
  let prevCwd;
  let prevEnv;
  let prevLog;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-tools-entry-html-'));
    prevCwd = process.cwd();
    prevEnv = ENV_KEYS.reduce((result, key) => Object.assign(result, { [key]: process.env[key] }), {});
    ENV_KEYS.forEach(key => delete process.env[key]);
    prevLog = console.log;
    console.log = () => {};
    process.chdir(tempDir);
    await fs.outputFile(path.join(tempDir, 'build/index.html'), INDEX_HTML);
    await fs.writeJson(path.join(tempDir, 'package.json'), { name: 'ai-interview-flowup', version: '0.1.192' });
  });

  afterEach(async () => {
    console.log = prevLog;
    process.chdir(prevCwd);
    ENV_KEYS.forEach(key => {
      if (prevEnv[key] === undefined) delete process.env[key];
      else process.env[key] = prevEnv[key];
    });
    await fs.remove(tempDir);
  });

  const writeManifest = files => fs.writeJson(path.join(tempDir, 'build/asset-manifest.json'), { files });

  it('按 OUTPUT_HTML_PATH 推导配置文件名', () => {
    assert.equal(path.basename(getRemoteModuleConfigPath('/a/build/entry-cn-prod.html')), 'remote-module-config-cn-prod.json');
    assert.equal(path.basename(getRemoteModuleConfigPath('/a/build/entry-prod.html')), 'remote-module-config-prod.json');
    assert.equal(path.basename(getRemoteModuleConfigPath('/a/build/entry.html')), 'remote-module-config.json');
    assert.equal(path.basename(getRemoteModuleConfigPath('/a/build/index.html')), 'remote-module-config.json');
    assert.equal(path.basename(getRemoteModuleConfigPath('/a/build/main.html')), 'remote-module-config-main.json');
  });

  it('从 asset-manifest 的 remoteEntry 容器名解析 version，url 为 DEPLOY_URL', async () => {
    await writeManifest({ 'main.js': '/static/js/main.js', 'ai_interview_flowup_0_1_181.js': '/remoteEntry.js' });
    process.env.DEPLOY_URL = 'https://cdn.leapin-ai.com/leapin-ai-interview-flowup/cn-prod/df09fca/';
    process.env.OUTPUT_HTML_PATH = 'build/entry-cn-prod.html';
    process.env.COMPONENTS_NAME = 'ai-interview-flowup';

    await generateEntryHtml();

    const config = await fs.readJson(path.join(tempDir, 'build/remote-module-config-cn-prod.json'));
    assert.deepEqual(config, {
      name: 'ai-interview-flowup',
      url: 'https://cdn.leapin-ai.com/leapin-ai-interview-flowup/cn-prod/df09fca',
      tpl: '{{url}}',
      version: '0.1.181'
    });
    const html = await fs.readFile(path.join(tempDir, 'build/entry-cn-prod.html'), 'utf8');
    assert.match(html, /window\.runtimePublicUrl='https:\/\/cdn\.leapin-ai\.com\/leapin-ai-interview-flowup\/cn-prod\/df09fca'/);
  });

  it('容器名版本与 package.json version 一致时输出原始 semver（含预发布号）', async () => {
    await fs.writeJson(path.join(tempDir, 'package.json'), { name: 'ai-interview-flowup', version: '1.0.0-beta.1' });
    await writeManifest({ 'ai_interview_flowup_1_0_0_beta_1.js': '/remoteEntry.js' });
    process.env.DEPLOY_URL = '/';
    process.env.OUTPUT_HTML_PATH = 'build/entry.html';
    process.env.COMPONENTS_NAME = 'ai-interview-flowup';

    await generateEntryHtml();

    const config = await fs.readJson(path.join(tempDir, 'build/remote-module-config.json'));
    assert.equal(config.version, '1.0.0-beta.1');
  });

  it('容器名与组件名不匹配时回退 package.json version', async () => {
    await writeManifest({ 'other_remote_1_0_0.js': '/remoteEntry.js' });
    process.env.DEPLOY_URL = '/';
    process.env.OUTPUT_HTML_PATH = 'build/entry.html';

    await generateEntryHtml();

    const config = await fs.readJson(path.join(tempDir, 'build/remote-module-config.json'));
    assert.equal(config.name, 'ai-interview-flowup');
    assert.equal(config.url, '');
    assert.equal(config.version, '0.1.192');
  });

  it('非远程组件项目（无 remoteEntry）不生成配置文件', async () => {
    await writeManifest({ 'main.js': '/static/js/main.js' });
    process.env.DEPLOY_URL = '/';
    process.env.OUTPUT_HTML_PATH = 'build/entry.html';

    await generateEntryHtml();

    assert.equal(await fs.pathExists(path.join(tempDir, 'build/entry.html')), true);
    assert.equal(await fs.pathExists(path.join(tempDir, 'build/remote-module-config.json')), false);
  });
});
