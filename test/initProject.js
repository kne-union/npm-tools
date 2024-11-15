const npmTool = require("../index");
npmTool.initProject('test','@kne-template/libs').catch((err) => {
    throw err;
});
