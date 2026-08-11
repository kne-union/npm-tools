const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const deployManifest = require('../lib/deployManifest');
const deployPackage = require('../lib/deployPackage');
const deployProject = require('../lib/deployProject');
const deployPrompts = require('../lib/deployPrompts');

describe('deployManifest', () => {
  let tempDir;
  let prevCwd;
  let prevInput;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-tools-deploy-manifest-'));
    prevCwd = process.cwd();
    prevInput = process.env.INPUT_PATH;
    process.chdir(tempDir);
    process.env.INPUT_PATH = path.join(tempDir, 'missing-manifest.json');
  });

  afterEach(async () => {
    process.chdir(prevCwd);
    if (prevInput === undefined) delete process.env.INPUT_PATH;
    else process.env.INPUT_PATH = prevInput;
    await fs.remove(tempDir);
  });

  it('入口文件不存在时应抛错', async () => {
    await assert.rejects(() => deployManifest(), /入口文件不存在/);
  });
});

describe('deployPackage', () => {
  let prevName;

  beforeEach(() => {
    prevName = process.env.PACKAGE_NAME;
    delete process.env.PACKAGE_NAME;
  });

  afterEach(() => {
    if (prevName === undefined) delete process.env.PACKAGE_NAME;
    else process.env.PACKAGE_NAME = prevName;
  });

  it('未传包名且无环境变量时应抛错', async () => {
    await assert.rejects(() => deployPackage(), /PACKAGE_NAME未正确设置/);
  });
});

describe('deployProject', () => {
  let tempDir;
  let prevCwd;
  let prevInput;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-tools-deploy-project-'));
    await fs.writeJson(path.join(tempDir, 'package.json'), { name: 'x', version: '1.0.0' });
    prevCwd = process.cwd();
    prevInput = process.env.INPUT;
    process.chdir(tempDir);
    process.env.INPUT = path.join(tempDir, 'package.json');
  });

  afterEach(async () => {
    process.chdir(prevCwd);
    if (prevInput === undefined) delete process.env.INPUT;
    else process.env.INPUT = prevInput;
    await fs.remove(tempDir);
  });

  it('缺少 deploy-components 时应抛错', async () => {
    await assert.rejects(() => deployProject(), /未找到deploy-components/);
  });
});

describe('deployPrompts', () => {
  it('PACKAGE_LIST_MAP 应包含约定类型', () => {
    assert.ok(deployPrompts.PACKAGE_LIST_MAP['frontend-libs']);
    assert.ok(deployPrompts.PACKAGE_LIST_MAP['node-libs']);
    assert.ok(deployPrompts.PACKAGE_LIST_MAP['fastify-project']);
  });

  it('未知类型应安全返回', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-tools-deploy-prompts-'));
    const prevCwd = process.cwd();
    process.chdir(tempDir);
    try {
      await deployPrompts('not-a-real-type');
    } finally {
      process.chdir(prevCwd);
      await fs.remove(tempDir);
    }
  });

  it('copyMdFiles 应只复制 md', async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'npm-tools-copy-md-'));
    const src = path.join(tempDir, 'src');
    const dest = path.join(tempDir, 'dest');
    await fs.ensureDir(path.join(src, 'sub'));
    await fs.writeFile(path.join(src, 'a.md'), '# a');
    await fs.writeFile(path.join(src, 'b.txt'), 'x');
    await fs.writeFile(path.join(src, 'sub', 'c.md'), '# c');
    await deployPrompts.copyMdFiles(src, dest);
    assert.equal(await fs.pathExists(path.join(dest, 'a.md')), true);
    assert.equal(await fs.pathExists(path.join(dest, 'sub', 'c.md')), true);
    assert.equal(await fs.pathExists(path.join(dest, 'b.txt')), false);
    await fs.remove(tempDir);
  });
});
