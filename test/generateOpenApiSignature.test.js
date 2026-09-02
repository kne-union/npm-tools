const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
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
          expireInSeconds: 600
        }
      );
      assert.deepEqual(generateOpenApiSignature.parseArgs([]), {
        appId: 'from-env-id',
        appSecret: 'from-env-secret',
        expireInSeconds: generateOpenApiSignature.DEFAULT_EXPIRE_SECONDS
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

  it('CLI stdout 应仅为 JSON（供 CI HEADERS_JSON=$(npx ...) 解析）', () => {
    const bin = path.join(__dirname, '../bin.js');
    const stdout = execFileSync(
      process.execPath,
      [bin, 'generateOpenApiSignature', '--app-id', 'test-id', '--app-secret', 'test-secret'],
      { encoding: 'utf8' }
    );

    assert.equal(stdout.trim().split('\n').length, 1);
    const parsed = JSON.parse(stdout.trim());
    assert.ok(parsed.headers['x-openapi-signature']);
  });
});
