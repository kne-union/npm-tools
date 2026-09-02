const crypto = require('node:crypto');
const fs = require('node:fs');

const DEFAULT_EXPIRE_SECONDS = 3 * 60;

const ENV_VAR_NAMES = {
  timestamp: 'OPENAPI_TIMESTAMP',
  expire: 'OPENAPI_EXPIRE',
  signature: 'OPENAPI_SIGNATURE'
};

/**
 * 生成 developer-document Open API 请求签名参数（与 @kne/fastify-signature/generateSignature 一致）。
 *
 * @param {object} options
 * @param {string} options.appId Open API App ID
 * @param {string} options.appSecret Open API App Secret
 * @param {number} [options.expireInSeconds=180] 签名有效期（秒）
 * @param {number} [options.now=Date.now()] 当前时间毫秒时间戳（便于测试注入）
 * @returns {{ appId: string, timestamp: number, expire: number, signature: string, headers: Record<string, string> }}
 */
const generateOpenApiSignature = ({
  appId,
  appSecret,
  expireInSeconds = DEFAULT_EXPIRE_SECONDS,
  now = Date.now()
} = {}) => {
  if (!appId) {
    throw new Error('appId 不能为空');
  }
  if (!appSecret) {
    throw new Error('appSecret 不能为空');
  }

  const timestamp = Math.floor(now / 1000);
  const expire = timestamp + expireInSeconds;
  const signature = crypto.createHmac('sha256', appSecret).update(`${appId}|${timestamp}|${expire}`).digest('hex');

  return {
    appId,
    timestamp,
    expire,
    signature,
    headers: {
      'x-openapi-appid': appId,
      'x-openapi-timestamp': String(timestamp),
      'x-openapi-expire': String(expire),
      'x-openapi-signature': signature
    }
  };
};

const toEnvValues = result => ({
  [ENV_VAR_NAMES.timestamp]: String(result.timestamp),
  [ENV_VAR_NAMES.expire]: String(result.expire),
  [ENV_VAR_NAMES.signature]: result.signature
});

const shellQuote = value => `'${String(value).replace(/'/g, `'\\''`)}'`;

const formatExportEnv = result =>
  Object.entries(toEnvValues(result))
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`)
    .join('\n');

const writeGithubEnv = result => {
  const githubEnvPath = process.env.GITHUB_ENV;
  if (!githubEnvPath) {
    throw new Error('GITHUB_ENV 未设置，无法写入环境变量');
  }

  const lines = Object.entries(toEnvValues(result)).map(([key, value]) => `${key}=${value}\n`);
  fs.appendFileSync(githubEnvPath, lines.join(''));
};

const parseArgs = argv => {
  const args = {
    appId: process.env.DEVELOPER_DOCUMENT_OPENAPI_APP_ID || process.env.OPENAPI_APP_ID || '',
    appSecret: process.env.DEVELOPER_DOCUMENT_OPENAPI_APP_SECRET || process.env.OPENAPI_APP_SECRET || '',
    expireInSeconds: DEFAULT_EXPIRE_SECONDS,
    output: 'export-env'
  };

  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (key === '--app-id') {
      args.appId = argv[++i] || '';
    } else if (key === '--app-secret') {
      args.appSecret = argv[++i] || '';
    } else if (key === '--expire-seconds') {
      args.expireInSeconds = Number(argv[++i] || DEFAULT_EXPIRE_SECONDS);
    } else if (key === '--json') {
      args.output = 'json';
    } else if (key === '--export-env') {
      args.output = 'export-env';
    } else if (key === '--github-env') {
      args.output = 'github-env';
    } else if (key === '--help' || key === '-h') {
      args.help = true;
    }
  }

  return args;
};

const printHelp = () => {
  console.log(`Usage:
  npx @kne/npm-tools generateOpenApiSignature [options]

Options:
  --app-id <id>           Open API App ID（缺省读 DEVELOPER_DOCUMENT_OPENAPI_APP_ID / OPENAPI_APP_ID）
  --app-secret <secret>   Open API App Secret（缺省读 DEVELOPER_DOCUMENT_OPENAPI_APP_SECRET / OPENAPI_APP_SECRET）
  --expire-seconds <sec>  签名有效期秒数，默认 ${DEFAULT_EXPIRE_SECONDS}
  --export-env            输出 shell export（默认；供 eval "$(npx ...)" 注入当前 step）
  --github-env            写入 GITHUB_ENV，供同 job 后续 step 使用
  --json                  输出 JSON（程序调用）
  -h, --help              打印帮助

写入的环境变量：OPENAPI_TIMESTAMP、OPENAPI_EXPIRE、OPENAPI_SIGNATURE
`);
};

const runCli = argv => {
  const args = parseArgs(argv);
  if (args.help) {
    printHelp();
    return;
  }

  const result = generateOpenApiSignature(args);

  if (args.output === 'json') {
    console.log(JSON.stringify(result));
    return;
  }

  if (args.output === 'github-env') {
    writeGithubEnv(result);
    return;
  }

  console.log(formatExportEnv(result));
};

module.exports = Object.assign(generateOpenApiSignature, {
  DEFAULT_EXPIRE_SECONDS,
  ENV_VAR_NAMES,
  formatExportEnv,
  toEnvValues,
  writeGithubEnv,
  parseArgs,
  printHelp,
  runCli
});
