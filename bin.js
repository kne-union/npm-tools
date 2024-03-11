#!/usr/bin/env node

const npmTool = require('./index');

const args = process.argv.slice(2);

const script = args[0];

console.log(`执行命令:${script || 'entryHtml'}`);

switch (script) {
    case 'latestVersion':
        npmTool.getLatestVersion().then((version) => console.log(version)).catch((err) => console.error(err));
        break;
    case 'nextMajorVersion':
        npmTool.getNextMajorVersion().then((version) => console.log(version)).catch((err) => console.error(err));
        break;
    case 'nextMinorVersion':
        npmTool.getNextMinorVersion().then((version) => console.log(version)).catch((err) => console.error(err));
        break;
    case 'nextPatchVersion':
        npmTool.getNextPatchVersion().then((version) => console.log(version)).catch((err) => console.error(err));
        break;
    case 'entryHtml':
    default:
        npmTool.generateEntryHtml().catch((err) => console.error(err));
}


