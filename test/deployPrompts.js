const deployPrompts = require('../lib/deployPrompts');

// 测试：传入类型参数
// deployPrompts('frontend-libs').catch((err) => {
//     throw err;
// });

// 测试：不传参数，使用 inquirer 交互选择
deployPrompts().catch((err) => {
    throw err;
});
