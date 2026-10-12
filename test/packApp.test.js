const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const JSZip = require('jszip');
const packApp = require('../lib/packApp');

const { parseArgs, checkEnvSchema, checkAppPackage, toAppName } = packApp;

const SCHEMA = {
  type: 'object',
  required: ['OSS_BUCKET'],
  properties: {
    PORT: { type: 'number', default: 8040 },
    OSS_BUCKET: { type: 'string', description: 'OSS bucket' },
    OSS_ACCESS_KEY_SECRET: { type: 'string', writeOnly: true }
  }
};

const silentLogger = { log: () => {}, warn: () => {} };

const createProject = async (root, { schema = SCHEMA, sqlFiles = ['001_init.sql'], serverPkg = { name: 'server', dependencies: { fastify: '^5.0.0' } } } = {}) => {
  await fs.outputJson(path.join(root, 'package.json'), { name: '@kne/demo-app', version: '1.2.3' });
  await fs.outputFile(path.join(root, 'build/index.html'), '<html></html>');
  await fs.outputFile(path.join(root, 'build/static/main.js'), 'console.log(1);');
  await fs.outputJson(path.join(root, 'server/package.json'), serverPkg);
  await fs.outputFile(path.join(root, 'server/index.js'), 'module.exports = {};');
  if (schema) {
    await fs.outputFile(path.join(root, 'server/env.schema.json'), typeof schema === 'string' ? schema : JSON.stringify(schema));
  }
  for (const file of sqlFiles) {
    await fs.outputFile(path.join(root, 'server/sql', file), 'select 1;');
  }
  await fs.outputFile(path.join(root, 'server/node_modules/fastify/index.js'), '');
  await fs.outputFile(path.join(root, 'server/build/cache.js'), '');
  await fs.outputFile(path.join(root, 'server/.env'), 'SECRET=1');
  await fs.outputFile(path.join(root, 'server/.env.local'), 'SECRET=1');
  await fs.outputFile(path.join(root, 'server/data.db'), 'sqlite');
  await fs.outputFile(path.join(root, 'server/logs/app.log'), 'log');
  await fs.outputFile(path.join(root, 'src/App.js'), 'export default 1;');
};

describe('packApp', () => {
  let root;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'pack-app-'));
  });

  afterEach(async () => {
    await fs.remove(root);
  });

  it('parses args', () => {
    assert.deepEqual(parseArgs(['--dir', 'a', '--out', 'b.zip', '--name', 'demo', '--version', '1.0.0', '--upload', '--api-url', 'http://x/api/v1', '--token', 't']), {
      dir: 'a',
      out: 'b.zip',
      name: 'demo',
      version: '1.0.0',
      upload: true,
      apiUrl: 'http://x/api/v1',
      token: 't',
      help: false
    });
  });

  it('derives app name from package name', () => {
    assert.equal(toAppName('@kne/Demo-App'), 'demo-app');
    assert.equal(toAppName('demo'), 'demo');
  });

  it('checks env schema structure', () => {
    assert.deepEqual(checkEnvSchema(SCHEMA), []);
    assert.match(checkEnvSchema([]).join(), /must be a JSON object/);
    assert.match(checkEnvSchema({ type: 'object', properties: {}, required: ['A'] }).join(), /required keys not declared in properties: A/);
    assert.match(checkEnvSchema({ type: 'object', properties: { A: { type: 'text' } } }).join(), /properties\.A\.type has invalid value text/);
    assert.match(checkEnvSchema({ properties: {} }).join(), /"type" must be "object"/);
  });

  it('reports every package problem at once', async () => {
    await createProject(root, { schema: null, sqlFiles: ['bad name.sql'], serverPkg: { dependencies: { foo: 'file:../foo' } } });
    await fs.remove(path.join(root, 'build/index.html'));
    const result = await checkAppPackage(root);
    assert.equal(result.ok, false);
    assert.deepEqual(result.errors, [
      'server/package.json has local dependencies that cannot be installed on the app center: foo@file:../foo',
      'build/ must contain one of: index.html, entry.html, entry-prod.html',
      'missing server/env.schema.json',
      'invalid sql file names (use [A-Za-z0-9_-.] and end with .sql): bad name.sql'
    ]);
  });

  it('rejects invalid env.schema.json JSON', async () => {
    await createProject(root, { schema: '{ bad' });
    const result = await checkAppPackage(root);
    assert.equal(result.ok, false);
    assert.match(result.errors[0], /server\/env\.schema\.json is not valid JSON/);
  });

  it('does not pack when the check fails', async () => {
    await createProject(root, { schema: null });
    const out = path.join(root, 'out.zip');
    await assert.rejects(packApp(['--out', out], { cwd: root, logger: silentLogger }), /应用包检查未通过[\s\S]*missing server\/env\.schema\.json/);
    assert.equal(await fs.pathExists(out), false);
  });

  it('packs package.json, build and server without local artifacts', async () => {
    await createProject(root);
    const out = path.join(root, 'out.zip');
    const result = await packApp(['--out', out], { cwd: root, logger: silentLogger });
    assert.equal(result.name, 'demo-app');
    assert.equal(result.version, '1.2.3');
    assert.equal(result.fileId, null);
    const zip = await JSZip.loadAsync(await fs.readFile(out));
    const files = Object.keys(zip.files)
      .filter(name => !zip.files[name].dir)
      .sort();
    assert.deepEqual(files, ['build/index.html', 'build/static/main.js', 'package.json', 'server/env.schema.json', 'server/index.js', 'server/package.json', 'server/sql/001_init.sql']);
  });

  it('uploads with the kne_document token and returns fileId', async () => {
    await createProject(root);
    const home = path.join(root, 'home');
    await fs.outputJson(path.join(home, '.kne_document/config.json'), { remote: { apiUrl: 'http://doc.test/api/v1', token: 'dev-token' } });
    const requests = [];
    const fetchImpl = async (url, init) => {
      requests.push({ url, init });
      return { ok: true, status: 200, statusText: 'OK', text: async () => JSON.stringify({ code: 0, data: { fileId: '42' } }) };
    };
    const result = await packApp(['--out', path.join(root, 'out.zip'), '--upload', '--name', 'demo'], { cwd: root, homedir: home, fetchImpl, logger: silentLogger });
    assert.equal(result.fileId, '42');
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, 'http://doc.test/api/v1/app-package/upload');
    assert.equal(requests[0].init.headers['x-user-token'], 'dev-token');
    const form = requests[0].init.body;
    assert.equal(form.get('name'), 'demo');
    assert.equal(form.get('version'), '1.2.3');
    assert.equal(form.get('file').name, 'out.zip');
  });

  it('fails upload without remote config', async () => {
    await createProject(root);
    await assert.rejects(packApp(['--out', path.join(root, 'out.zip'), '--upload'], { cwd: root, homedir: path.join(root, 'empty-home'), logger: silentLogger }), /缺少上传地址或令牌/);
  });

  it('surfaces server errors on upload', async () => {
    await createProject(root);
    const fetchImpl = async () => ({ ok: false, status: 404, statusText: 'Not Found', text: async () => JSON.stringify({ msg: 'app demo not found' }) });
    await assert.rejects(
      packApp(['--out', path.join(root, 'out.zip'), '--upload', '--api-url', 'http://doc.test/api/v1', '--token', 't', '--name', 'demo'], { cwd: root, fetchImpl, logger: silentLogger }),
      /failed \(404\): app demo not found/
    );
  });
});
