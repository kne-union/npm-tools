const downloadNpmPackage = require('@kne/fetch-npm-package');
const loadNpmInfo = require('@kne/load-npm-info');
const fs = require('fs-extra');
const path = require('path');
const { select, input } = require('@inquirer/prompts');

// 包列表映射（用户稍后补充）
const PACKAGE_LIST_MAP = {
  'frontend-libs': ['@kne/prompts-libs'],
  'frontend-remote-components': ['@kne/prompts-remote-components'],
  'frontend-project': ['@kne/prompts-remote-components', '@kne/prompts-projects'],
  'node-libs': ['@kne/prompts-node-libs'],
  'fastify-libs': ['@kne/prompts-node-libs', '@kne/prompts-fastify-libs'],
  'fastify-project': ['@kne/prompts-node-libs', '@kne/prompts-fastify-libs', '@kne/prompts-remote-components', '@kne/prompts-projects']
};

// 递归复制目录中的 .md 文件
const copyMdFiles = async (srcDir, destDir) => {
  await fs.ensureDir(destDir);
  const entries = await fs.readdir(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.resolve(srcDir, entry.name);
    const destPath = path.resolve(destDir, entry.name);

    if (entry.isDirectory()) {
      await copyMdFiles(srcPath, destPath);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      await fs.copy(srcPath, destPath);
    }
  }
};

const deployPrompts = async type => {
  const promptsDir = path.resolve(process.cwd(), './prompts');
  const promptsJsonPath = path.resolve(promptsDir, './prompts.json');

  // 确保 prompts 目录存在
  await fs.ensureDir(promptsDir);

  // 初始化 prompts.json（如果不存在）
  if (!(await fs.exists(promptsJsonPath))) {
    await fs.writeJson(promptsJsonPath, {}, { spaces: 2 });
  }

  // 如果没有传入 type，使用 inquirer 让用户选择
  let selectedType = type;
  let customPackageName = null;
  if (!selectedType) {
    selectedType = await select({
      message: '请选择要部署的 prompts 类型',
      choices: [
        { name: 'Frontend Libs', value: 'frontend-libs' },
        { name: 'Frontend Remote Components', value: 'frontend-remote-components' },
        { name: 'Frontend Project', value: 'frontend-project' },
        { name: 'Node Libs', value: 'node-libs' },
        { name: 'Fastify Libs', value: 'fastify-libs' },
        { name: 'Fastify Project', value: 'fastify-project' },
        { name: 'Other (自定义包名)', value: 'other' }
      ]
    });

    if (selectedType === 'other') {
      customPackageName = await input({
        message: '请输入 npm 包名',
        validate: value => (value.trim() ? true : '包名不能为空')
      });
    }
  }

  // 获取要安装的包列表
  let packageList;
  if (customPackageName) {
    packageList = [customPackageName.trim()];
  } else {
    packageList = PACKAGE_LIST_MAP[selectedType];
  }

  if (!(packageList && packageList.length > 0)) {
    console.warn('没有可用的prompt包列表');
    return;
  }

  // 读取当前的 prompts.json
  const promptsJson = await fs.readJson(promptsJsonPath);

  // 记录失败的包
  const failedPackages = [];

  // 遍历包列表，下载并部署
  for (const packageName of packageList) {
    try {
      console.log(`正在处理包: ${packageName}`);

      // 获取包信息
      const info = await loadNpmInfo(packageName);
      const packageVersion = info.version;

      // 获取包名（不带 scope）
      const packageDirName = packageName.replace(/^@.+\//, '');
      const targetDir = path.resolve(promptsDir, `./${packageDirName}`);

      // 部署前先清空目标文件夹
      await fs.emptyDir(targetDir);

      await downloadNpmPackage(packageName, packageVersion, {
        callback: async downloadedDir => {
          // 复制 README.md
          const readmePath = path.resolve(downloadedDir, './README.md');
          if (await fs.exists(readmePath)) {
            await fs.copy(readmePath, path.resolve(targetDir, './README.md'));
          }

          // 复制 prompts 目录下的所有 .md 文件
          const packagePromptsDir = path.resolve(downloadedDir, './prompts');
          if (await fs.exists(packagePromptsDir)) {
            await copyMdFiles(packagePromptsDir, targetDir);
          }
        }
      });
      // 更新 prompts.json
      promptsJson[packageName] = packageVersion;

      console.log(`包 ${packageName}@${packageVersion} 部署完成`);
    } catch (err) {
      console.warn(`包 ${packageName} 不存在或部署失败: ${err.message}`);
      failedPackages.push(packageName);
    }
  }
  await fs.copy(path.resolve(__dirname, './PROMPTS_INDEX_GENERATION.md'), path.resolve(promptsDir, './生成README索引.md'));
  // 保存 prompts.json
  await fs.writeJson(promptsJsonPath, promptsJson, { spaces: 2 });

  if (failedPackages.length > 0) {
    console.log(`prompts 部署完成，其中 ${failedPackages.length} 个包失败: ${failedPackages.join(', ')}`);
  } else {
    console.log('所有 prompts 部署完成');
  }
};

module.exports = deployPrompts;
