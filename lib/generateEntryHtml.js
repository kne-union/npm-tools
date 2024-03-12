const jsdom = require('jsdom');
const fs = require('fs-extra');
const path = require('path');
const ensureSlash = require('@kne/ensure-slash');
const lodash = require('lodash');

const {JSDOM} = jsdom;

module.exports = async () => {
    if (!process.env.DEPLOY_URL) {
        console.error('未正确设置DEPLOY_URL');
        return;
    }

    const appName = '/' + (process.env.APP_NAME || '').replace(/^\//, '');

    const compiled = lodash.template(ensureSlash(process.env.DEPLOY_URL), {interpolate: /{{([\s\S]+?)}}/g});

    const baseUrl = compiled({APP_NAME: process.env.APP_NAME || '', VERSION: process.env.VERSION || ''});

    const replaceUrlsTask = [{
        origin: appName, target: baseUrl
    }, {
        origin: 'static/js', target: `${baseUrl}/static/js`
    }, {
        origin: 'remoteEntry.js', target: `${baseUrl}/remoteEntry.js`
    }];
    console.log('replaceUrlsTask:', JSON.stringify(replaceUrlsTask));

    const indexPath = path.resolve(process.cwd(), process.env.INDEX_HTML_PATH || 'build/index.html');
    const indexFile = await fs.readFile(indexPath);
    const dom = new JSDOM(indexFile);
    const {window} = dom;
    [].forEach.call(window.document.head.children, (el) => {
        ['src', 'href'].forEach((attr) => {
            const attrValue = el.getAttribute(attr);
            replaceUrlsTask.forEach(({origin, target}) => {
                if ((attrValue || '').indexOf(origin) === 0) {
                    el.setAttribute(attr, attrValue.replace(origin, target));
                }
            });
        });
    });
    let innerHTML = `window.runtimeAppName=${process.env.APP_NAME || ''};window.runtimePublicUrl=${baseUrl};`;
    if (process.env?.RUNTIME_ENV) {
        console.log('RUNTIME_ENV:', process.env?.RUNTIME_ENV);
        innerHTML = innerHTML + 'window.runtimeEnv = {};';
        process.env.RUNTIME_ENV.split(';').filter((str) => !!str).forEach(item => {
            const splitIndex = item.indexOf(':');
            innerHTML = innerHTML + `window.runtimeEnv["${item.slice(0, splitIndex).trim()}"] = "${item.slice(+splitIndex + 1)}";`;
        })
    }
    const scriptEl = window.document.createElement('script');
    scriptEl.innerHTML = innerHTML;
    window.document.head.appendChild(scriptEl);

    const output = dom.serialize();
    console.log('生成结果:', output);
    await fs.writeFile(indexPath, output);
};
