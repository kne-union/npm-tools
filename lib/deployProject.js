const fs = require('fs-extra');
const path = require('node:path');
const deployPackage = require('./deployPackage');
module.exports = async () => {
  const packageJson = await fs.readJson(path.resolve(process.cwd(), process.env.INPUT || 'package.json'));
  const outputDir = path.resolve(process.cwd(), process.env.OUTPUT_PATH || './build');
  const deployComponents = packageJson['deploy-components'] || {};
  const deployComponentsKeys = Object.keys(deployComponents);
  if (deployComponentsKeys.length === 0) {
    throw new Error('package.json中未找到deploy-components字段，或者该字段为空!');
  }

  const deploy = async (name, version) => {
    if (await fs.exists(path.resolve(outputDir, `./${name}/${version}/package.json`))) {
      console.log(`${name}@${version}已存在，跳过部署`);
      return;
    }
    await deployPackage(`${name}@${version}`);
  };

  for (const name of deployComponentsKeys) {
    const version = deployComponents[name];
    if (Array.isArray(version)) {
      for (const v of version) {
        await deploy(name, v);
      }
    } else {
      await deploy(name, version);
    }
  }
  console.log('部署完成👋');
};
