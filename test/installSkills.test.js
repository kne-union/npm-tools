const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs-extra');
const installSkills = require('../lib/installSkills');

const {
  sha256,
  resolveSafePath,
  mergeManagedBlock,
  fetchInstallManifest,
  getManifestPath,
  MANIFEST_RELATIVE_PATH
} = installSkills;

const BLOCK_ID = 'developer-document:skills';
const MEMORY_PATH = '~/.workbuddy/user-test-personal/MEMORY.md';
const SYNC_URL = 'http://localhost:8061/api/v1';

const makeFile = (name, filePath, content = `# ${name}\n`) => ({
  id: name,
  kind: 'skill',
  name,
  path: filePath,
  content,
  contentHash: sha256(content)
});

const makeBlock = content => ({
  scope: 'user',
  path: MEMORY_PATH,
  blockId: BLOCK_ID,
  strategy: 'replace-managed-block',
  budget: 2000,
  degraded: false,
  content,
  contentHash: sha256(content)
});

const makeManifest = (target, files, memoryBlocks = []) => ({
  schemaVersion: 1,
  target,
  generator: 'developer-document',
  generatedAt: '2026-11-06T22:00:00.000Z',
  total: files.length,
  files,
  memoryBlocks
});

const blockContent = body =>
  [`<!-- BEGIN managed:${BLOCK_ID} -->`, '## 常驻规则（技能管理同步，请勿手改）', '', body, `<!-- END managed:${BLOCK_ID} -->`].join('\n');

describe('installSkills', () => {
  let tempHome;

  beforeEach(async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), 'install-skills-'));
  });

  afterEach(async () => {
    await fs.remove(tempHome);
  });

  it('resolveSafePath 只允许白名单根目录', () => {
    assert.equal(resolveSafePath('~/.cursor/rules/a.mdc', tempHome), path.join(tempHome, '.cursor', 'rules', 'a.mdc'));
    assert.equal(resolveSafePath('~/.workbuddy/skills/a/SKILL.md', tempHome), path.join(tempHome, '.workbuddy', 'skills', 'a', 'SKILL.md'));
    assert.throws(() => resolveSafePath('~/.ssh/authorized_keys', tempHome), /越过允许范围/);
    assert.throws(() => resolveSafePath('~/.workbuddy/skills/../../evil/SKILL.md', tempHome), /非法安装路径/);
    assert.throws(() => resolveSafePath('/etc/passwd', tempHome), /必须以 ~\//);
  });

  it('mergeManagedBlock 首次应追加，且区块外内容不变', () => {
    const original = '# 长期记忆\n\n## 用户偏好\n\n- 中文回答\n';
    const block = blockContent('- **rule-a**：说明');
    const merged = mergeManagedBlock(original, block, BLOCK_ID);
    assert.ok(merged.startsWith(original));
    assert.ok(merged.includes(block));
  });

  it('mergeManagedBlock 重复执行应幂等替换，不重复追加', () => {
    const original = '# 长期记忆\n';
    const first = mergeManagedBlock(original, blockContent('- **rule-a**：说明'), BLOCK_ID);
    const second = mergeManagedBlock(first, blockContent('- **rule-b**：新说明'), BLOCK_ID);
    assert.equal(first.split(`BEGIN managed:${BLOCK_ID}`).length - 1, 1);
    assert.equal(second.split(`BEGIN managed:${BLOCK_ID}`).length - 1, 1);
    assert.ok(second.includes('- **rule-b**：新说明'));
    assert.ok(!second.includes('- **rule-a**：说明'));
    assert.ok(second.startsWith(original));
  });

  it('mergeManagedBlock 标记重复或不完整时应拒绝写入', () => {
    const broken = `${blockContent('a')}\n${blockContent('b')}`;
    assert.throws(() => mergeManagedBlock(broken, blockContent('c'), BLOCK_ID), /重复或不完整/);
    assert.throws(() => mergeManagedBlock(`<!-- BEGIN managed:${BLOCK_ID} -->\n`, blockContent('c'), BLOCK_ID), /重复或不完整/);
  });

  it('应同时落盘 cursor 的 rule 与 skill，并写入 manifest', async () => {
    const files = [
      makeFile('commit-message', '~/.cursor/rules/commit-message.mdc', '---\ndescription: x\n---\n\n# 规范\n'),
      makeFile('weekly-report', '~/.cursor/skills/weekly-report/SKILL.md')
    ];
    const result = await installSkills({ manifest: makeManifest('cursor', files), target: 'cursor', homedir: tempHome });

    assert.equal(result.summary.installed, 2);
    assert.equal(result.summary.failed, 0);
    assert.equal(await fs.readFile(path.join(tempHome, '.cursor', 'rules', 'commit-message.mdc'), 'utf8'), files[0].content);
    assert.equal(await fs.readFile(path.join(tempHome, '.cursor', 'skills', 'weekly-report', 'SKILL.md'), 'utf8'), files[1].content);
    assert.equal(getManifestPath(tempHome), path.join(tempHome, MANIFEST_RELATIVE_PATH));
    assert.ok(await fs.pathExists(getManifestPath(tempHome)));
  });

  it('重复安装应跳过；内容变化时应先备份再覆盖', async () => {
    const file = makeFile('demo', '~/.workbuddy/skills/demo/SKILL.md', 'v1\n');
    await installSkills({ manifest: makeManifest('workbuddy', [file]), target: 'workbuddy', homedir: tempHome });
    const again = await installSkills({ manifest: makeManifest('workbuddy', [file]), target: 'workbuddy', homedir: tempHome });
    assert.equal(again.summary.skipped, 1);
    assert.equal(again.summary.backedUp, 0);

    const changed = makeFile('demo', file.path, 'v2\n');
    const updated = await installSkills({ manifest: makeManifest('workbuddy', [changed]), target: 'workbuddy', homedir: tempHome });
    assert.equal(updated.summary.installed, 1);
    assert.equal(updated.summary.backedUp, 1);
    assert.equal(await fs.readFile(path.join(tempHome, '.workbuddy', 'skills', 'demo', 'SKILL.md'), 'utf8'), 'v2\n');
    const backups = (await fs.readdir(path.join(tempHome, '.workbuddy', 'skills', 'demo'))).filter(name => name.startsWith('SKILL.md.bak.'));
    assert.equal(backups.length, 1);
    assert.equal(await fs.readFile(path.join(tempHome, '.workbuddy', 'skills', 'demo', backups[0]), 'utf8'), 'v1\n');
  });

  it('WorkBuddy 托管区块写入后，MEMORY.md 区块外内容逐字节不变', async () => {
    const memoryDir = path.join(tempHome, '.workbuddy', 'user-test-personal');
    await fs.ensureDir(memoryDir);
    const memoryFile = path.join(memoryDir, 'MEMORY.md');
    const original = '# 长期记忆（用户级）\n\n## 知识检索规则\n\n- 先查文档再读源码\n\n## 项目约定\n\n- 周报用叙述体\n';
    await fs.writeFile(memoryFile, original, 'utf8');

    const file = makeFile('rule-a', '~/.workbuddy/skills/rule-a/SKILL.md');
    const block = makeBlock(blockContent('- **rule-a**：必须遵守'));
    const result = await installSkills({ manifest: makeManifest('workbuddy', [file], [block]), target: 'workbuddy', homedir: tempHome });

    assert.equal(result.summary.installed, 2);
    const after = await fs.readFile(memoryFile, 'utf8');
    assert.ok(after.startsWith(original));
    assert.ok(after.includes(block.content));
    const backups = (await fs.readdir(memoryDir)).filter(name => name.startsWith('MEMORY.md.bak.'));
    assert.equal(backups.length, 1);
    assert.equal(await fs.readFile(path.join(memoryDir, backups[0]), 'utf8'), original);

    const again = await installSkills({ manifest: makeManifest('workbuddy', [file], [block]), target: 'workbuddy', homedir: tempHome });
    assert.equal(again.summary.skipped, 2);
    assert.equal(await fs.readFile(memoryFile, 'utf8'), after);

    const changed = makeBlock(blockContent('- **rule-a**：新说明'));
    await installSkills({ manifest: makeManifest('workbuddy', [file], [changed]), target: 'workbuddy', homedir: tempHome });
    const replaced = await fs.readFile(memoryFile, 'utf8');
    assert.ok(replaced.startsWith(original));
    assert.equal(replaced.split(`BEGIN managed:${BLOCK_ID}`).length - 1, 1);
    assert.ok(!replaced.includes('必须遵守'));
  });

  it('找不到账号目录时只跳过托管区块，技能文件仍安装', async () => {
    const file = makeFile('rule-a', '~/.workbuddy/skills/rule-a/SKILL.md');
    const block = makeBlock(blockContent('- **rule-a**：必须遵守'));
    const result = await installSkills({ manifest: makeManifest('workbuddy', [file], [block]), target: 'workbuddy', homedir: tempHome });
    assert.equal(result.summary.installed, 1);
    assert.equal(result.summary.skipped, 1);
    assert.ok(result.summary.warnings.some(warning => warning.includes('MEMORY.md')));
    assert.ok(await fs.pathExists(path.join(tempHome, '.workbuddy', 'skills', 'rule-a', 'SKILL.md')));
    assert.ok(!(await fs.pathExists(path.join(tempHome, '.workbuddy', 'user-test-personal'))));
  });

  it('唯一账号目录存在但 MEMORY.md 缺失时应新建，并保证二次执行幂等', async () => {
    const memoryDir = path.join(tempHome, '.workbuddy', 'user-test-personal');
    await fs.ensureDir(memoryDir);
    const memoryFile = path.join(memoryDir, 'MEMORY.md');
    const block = makeBlock(blockContent('- **rule-a**：必须遵守'));

    const result = await installSkills({ manifest: makeManifest('workbuddy', [], [block]), target: 'workbuddy', homedir: tempHome });
    assert.equal(result.summary.installed, 1);
    assert.equal(result.memoryBlocks[0].created, true);
    assert.equal(result.memoryBlocks[0].backupPath, null);
    const created = await fs.readFile(memoryFile, 'utf8');
    assert.ok(created.startsWith(`<!-- BEGIN managed:${BLOCK_ID} -->`));
    assert.ok(created.includes('- **rule-a**：必须遵守'));
    assert.equal(created, `${block.content}\n`);

    const again = await installSkills({ manifest: makeManifest('workbuddy', [], [block]), target: 'workbuddy', homedir: tempHome });
    assert.equal(again.summary.skipped, 1);
    assert.equal(await fs.readFile(memoryFile, 'utf8'), created);
    assert.equal((await fs.readdir(memoryDir)).filter(name => name.startsWith('MEMORY.md.bak.')).length, 0);
  });

  it('多个账号目录都有 MEMORY.md 时应跳过，不猜测账号', async () => {
    for (const name of ['user-a-personal', 'user-b-personal']) {
      await fs.outputFile(path.join(tempHome, '.workbuddy', name, 'MEMORY.md'), `# ${name}\n`, 'utf8');
    }
    const block = makeBlock(blockContent('- **rule-a**：必须遵守'));
    const result = await installSkills({ manifest: makeManifest('workbuddy', [], [block]), target: 'workbuddy', homedir: tempHome });
    assert.equal(result.summary.skipped, 1);
    assert.ok(result.summary.warnings.some(warning => warning.includes('多账号')));
  });

  it('多个账号目录且都没有 MEMORY.md 时不应新建', async () => {
    for (const name of ['user-a-personal', 'user-b-personal']) {
      await fs.ensureDir(path.join(tempHome, '.workbuddy', name));
    }
    const block = makeBlock(blockContent('- **rule-a**：必须遵守'));
    const result = await installSkills({ manifest: makeManifest('workbuddy', [], [block]), target: 'workbuddy', homedir: tempHome });
    assert.equal(result.summary.skipped, 1);
    assert.ok(!(await fs.pathExists(path.join(tempHome, '.workbuddy', 'user-a-personal', 'MEMORY.md'))));
    assert.ok(!(await fs.pathExists(path.join(tempHome, '.workbuddy', 'user-b-personal', 'MEMORY.md'))));
  });

  it('多个账号目录但只有一个已有 MEMORY.md 时应写入该文件', async () => {
    const withMemory = path.join(tempHome, '.workbuddy', 'user-a-personal', 'MEMORY.md');
    await fs.outputFile(withMemory, '# 手写记忆\n', 'utf8');
    await fs.ensureDir(path.join(tempHome, '.workbuddy', 'user-b-personal'));
    const block = makeBlock(blockContent('- **rule-a**：必须遵守'));
    const result = await installSkills({ manifest: makeManifest('workbuddy', [], [block]), target: 'workbuddy', homedir: tempHome });
    assert.equal(result.summary.installed, 1);
    assert.equal(result.memoryBlocks[0].created, false);
    assert.ok((await fs.readFile(withMemory, 'utf8')).startsWith('# 手写记忆\n'));
    assert.ok(!(await fs.pathExists(path.join(tempHome, '.workbuddy', 'user-b-personal', 'MEMORY.md'))));
  });

  it('--dry-run 不应新建 MEMORY.md', async () => {
    await fs.ensureDir(path.join(tempHome, '.workbuddy', 'user-test-personal'));
    const block = makeBlock(blockContent('- **rule-a**：必须遵守'));
    const result = await installSkills({ manifest: makeManifest('workbuddy', [], [block]), target: 'workbuddy', homedir: tempHome, dryRun: true });
    assert.equal(result.summary.installed, 0);
    assert.ok(!(await fs.pathExists(path.join(tempHome, '.workbuddy', 'user-test-personal', 'MEMORY.md'))));
  });

  it('路径越界或 contentHash 不符应跳过该条并计数，不影响其它条目', async () => {
    const good = makeFile('good', '~/.workbuddy/skills/good/SKILL.md');
    const evil = makeFile('evil', '~/.workbuddy/skills/../../.ssh/authorized_keys', 'bad\n');
    const tampered = makeFile('tamper', '~/.workbuddy/skills/tamper/SKILL.md', 'real\n');
    tampered.contentHash = sha256('fake\n');

    const result = await installSkills({ manifest: makeManifest('workbuddy', [good, evil, tampered]), target: 'workbuddy', homedir: tempHome });
    assert.equal(result.summary.installed, 1);
    assert.equal(result.summary.failed, 2);
    assert.ok(result.summary.warnings.some(warning => warning.includes('非法安装路径')));
    assert.ok(result.summary.warnings.some(warning => warning.includes('contentHash')));
    assert.ok(!(await fs.pathExists(path.join(tempHome, '.ssh', 'authorized_keys'))));
  });

  it('服务端清单目标不匹配或版本不支持时应拒绝', async () => {
    await assert.rejects(
      () => installSkills({ manifest: makeManifest('cursor', []), target: 'workbuddy', homedir: tempHome }),
      /目标不匹配/
    );
    const wrongVersion = Object.assign(makeManifest('workbuddy', []), { schemaVersion: 99 });
    await assert.rejects(() => installSkills({ manifest: wrongVersion, target: 'workbuddy', homedir: tempHome }), /不支持的安装清单版本/);
  });

  it('--dry-run 不应写任何文件或 manifest', async () => {
    const file = makeFile('demo', '~/.workbuddy/skills/demo/SKILL.md');
    const result = await installSkills({ manifest: makeManifest('workbuddy', [file]), target: 'workbuddy', homedir: tempHome, dryRun: true });
    assert.equal(result.summary.installed, 0);
    assert.ok(!(await fs.pathExists(path.join(tempHome, '.workbuddy', 'skills', 'demo', 'SKILL.md'))));
    assert.ok(!(await fs.pathExists(getManifestPath(tempHome))));
  });

  it('--skills-dir 应覆盖 skills 目录，但规则 .mdc 仍在原位置', async () => {
    const custom = path.join(tempHome, 'custom-skills');
    const files = [
      makeFile('demo', '~/.workbuddy/skills/demo/SKILL.md'),
      makeFile('rule-a', '~/.cursor/rules/rule-a.mdc')
    ];
    await installSkills({ manifest: makeManifest('cursor', files), target: 'cursor', homedir: tempHome, skillsDir: custom });
    assert.ok(await fs.pathExists(path.join(custom, 'demo', 'SKILL.md')));
    assert.ok(await fs.pathExists(path.join(tempHome, '.cursor', 'rules', 'rule-a.mdc')));
  });

  it('fetchInstallManifest 应带 Bearer 令牌并解包 data', async () => {
    const manifest = makeManifest('workbuddy', []);
    let captured;
    const result = await fetchInstallManifest({
      syncUrl: `${SYNC_URL}/`,
      token: 'token-value',
      target: 'workbuddy',
      params: { type: 'rule' },
      fetchImpl: async (url, options) => {
        captured = { url, options };
        return { ok: true, status: 200, json: async () => ({ code: 0, data: manifest }) };
      }
    });
    assert.deepEqual(result, manifest);
    assert.equal(captured.url, `${SYNC_URL}/skill/export?target=workbuddy&type=rule`);
    assert.equal(captured.options.headers.Authorization, 'Bearer token-value');
  });
});
