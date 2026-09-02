const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const generateOpenApiSignature = require('../lib/generateOpenApiSignature');

describe('generateOpenApiSignature', () => {
  const appId = '196203562894623744';
  const appSecret = '2a2eda5baef55aad31fc3cf63ce1c1d542c95b53aa7a433d569c75c20adc2ec3';
  const expireInSeconds = 180;
  const now = 1_700_000_000_000;

  it('应生成与 fastify-signature 一致的 HMAC 签名', () => {
    const timestamp = Math.floor(now / 1000);
    const expire = timestamp + expireInSeconds;
    const expectedSignature = crypto
      .createHmac('sha256', appSecret)
      .update(`${appId}|${timestamp}|${expire}`)
      .digest('hex');

    const result = generateOpenApiSignature({ appId, appSecret, expireInSeconds, now });

    assert.equal(result.timestamp, timestamp);
    assert.equal(result.expire, expire);
    assert.equal(result.signature, expectedSignature);
    assert.deepEqual(result.headers, {
      'x-openapi-appid': appId,
      'x-openapi-timestamp': String(timestamp),
      'x-openapi-expire': String(expire),
      'x-openapi-signature': expectedSignature
    });
  });

  it('缺少 appId / appSecret 时应抛错', () => {
    assert.throws(() => generateOpenApiSignature({ appSecret }), /appId 不能为空/);
    assert.throws(() => generateOpenApiSignature({ appId }), /appSecret 不能为空/);
  });

  it('parseArgs 应解析 CLI 参数并支持环境变量兜底', () => {
    const previousAppId = process.env.OPENAPI_APP_ID;
    const previousAppSecret = process.env.OPENAPI_APP_SECRET;
    process.env.OPENAPI_APP_ID = 'from-env-id';
    process.env.OPENAPI_APP_SECRET = 'from-env-secret';

    try {
      assert.deepEqual(
        generateOpenApiSignature.parseArgs(['--app-id', 'cli-id', '--app-secret', 'cli-secret', '--expire-seconds', '600']),
        {
          appId: 'cli-id',
          appSecret: 'cli-secret',
          expireInSeconds: 600,
          output: 'export-env'
        }
      );
      assert.deepEqual(generateOpenApiSignature.parseArgs([]), {
        appId: 'from-env-id',
        appSecret: 'from-env-secret',
        expireInSeconds: generateOpenApiSignature.DEFAULT_EXPIRE_SECONDS,
        output: 'export-env'
      });
    } finally {
      if (previousAppId === undefined) {
        delete process.env.OPENAPI_APP_ID;
      } else {
        process.env.OPENAPI_APP_ID = previousAppId;
      }
      if (previousAppSecret === undefined) {
        delete process.env.OPENAPI_APP_SECRET;
      } else {
        process.env.OPENAPI_APP_SECRET = previousAppSecret;
      }
    }
  });

  it('formatExportEnv 应输出可 eval 的 export 语句', () => {
    const result = generateOpenApiSignature({ appId, appSecret, expireInSeconds, now });
    const stdout = generateOpenApiSignature.formatExportEnv(result);

    assert.match(stdout, /^export OPENAPI_TIMESTAMP='/);
    assert.match(stdout, /export OPENAPI_SIGNATURE='/);

    const env = {};
    stdout.split('\n').forEach(line => {
      // eslint-disable-next-line no-eval
      eval(`${line.replace(/^export /, 'env.')}`);
    });

    assert.equal(env.OPENAPI_TIMESTAMP, String(result.timestamp));
    assert.equal(env.OPENAPI_EXPIRE, String(result.expire));
    assert.equal(env.OPENAPI_SIGNATURE, result.signature);
  });

  it('writeGithubEnv 应写入 GITHUB_ENV 文件', () => {
    const githubEnvPath = path.join(os.tmpdir(), `openapi-github-env-${Date.now()}`);
    const previousGithubEnv = process.env.GITHUB_ENV;
    process.env.GITHUB_ENV = githubEnvPath;

    try {
      const result = generateOpenApiSignature({ appId, appSecret, expireInSeconds, now });
      generateOpenApiSignature.writeGithubEnv(result);
      const content = fs.readFileSync(githubEnvPath, 'utf8');
      assert.match(content, /OPENAPI_TIMESTAMP=\d+/);
      assert.match(content, /OPENAPI_SIGNATURE=[0-9a-f]+/);
    } finally {
      fs.rmSync(githubEnvPath, { force: true });
      if (previousGithubEnv === undefined) {
        delete process.env.GITHUB_ENV;
      } else {
        process.env.GITHUB_ENV = previousGithubEnv;
      }
    }
  });

  it('CLI 默认输出 export 语句', () => {
    const bin = path.join(__dirname, '../bin.js');
    const stdout = execFileSync(
      process.execPath,
      [bin, 'generateOpenApiSignature', '--app-id', 'test-id', '--app-secret', 'test-secret'],
      { encoding: 'utf8' }
    );

    assert.match(stdout, /export OPENAPI_TIMESTAMP='/);
    assert.doesNotMatch(stdout, /执行命令:/);
  });

  it('CLI --json 应输出 JSON', () => {
    const bin = path.join(__dirname, '../bin.js');
    const stdout = execFileSync(
      process.execPath,
      [bin, 'generateOpenApiSignature', '--app-id', 'test-id', '--app-secret', 'test-secret', '--json'],
      { encoding: 'utf8' }
    );

    const parsed = JSON.parse(stdout.trim());
    assert.ok(parsed.headers['x-openapi-signature']);
  });
});
