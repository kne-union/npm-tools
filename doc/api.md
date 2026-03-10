### 命令行接口

#### 版本管理命令

| 命令 | 参数 | 说明 |
|------|------|------|
| `latestVersion` | `<package-name>` | 获取指定包的最新版本号 |
| `nextMajorVersion` | - | 递增主版本号（如 1.0.0 → 2.0.0） |
| `nextMinorVersion` | - | 递增次版本号（如 1.0.0 → 1.1.0） |
| `nextPatchVersion` | - | 递增修订号（如 1.0.0 → 1.0.1） |

#### 包信息命令

| 命令 | 参数 | 说明 |
|------|------|------|
| `packageInfo` | `<key>` | 获取当前项目 package.json 中的字段值 |

**packageInfo 特殊字段说明：**

| 字段名 | 说明 |
|--------|------|
| `name` | 包名（不含 scope） |
| `packageName` | 完整包名（含 scope） |
| `packageScope` | scope 名称 |

#### 下载与部署命令

| 命令 | 参数 | 说明 |
|------|------|------|
| `download` | `<npm-package-name>` | 下载指定的 npm 包 |
| `deploy` | - | 执行 manifest 部署 |
| `deployPackage` | - | 执行 package 部署 |
| `deployProject` | - | 执行 project 部署 |
| `deployPrompts` | `[type]` | 部署 prompts 文档 |

#### deployPrompts 类型参数

| 类型值 | 说明 |
|--------|------|
| `frontend-libs` | 前端库 prompts |
| `frontend-remote-components` | 前端远程组件 prompts |
| `frontend-project` | 前端项目 prompts |
| `node-libs` | Node.js 库 prompts |
| `fastify-libs` | Fastify 库 prompts |
| `fastify-project` | Fastify 项目 prompts |
| `other` | 自定义包名（交互式输入） |

#### 项目初始化命令

| 命令 | 参数 | 说明 |
|------|------|------|
| `init` | `<project-name> [template]` | 初始化项目 |

**可选模板列表：**

| 模板名称 | 包名 | 说明 |
|----------|------|------|
| NodeJS Libs | `@kne-template/node` | Node.js 库模板 |
| Fastify Server Project | `@kne-template/fastify-server` | Fastify 服务端项目 |
| Fastify Libs | `@kne-template/fastify-libs` | Fastify 库模板 |
| Fastify Business Project | `@kne-template/fastify-app` | Fastify 业务项目 |
| Frontend Libs | `@kne-template/libs` | 前端库模板 |
| Remote Components | `@kne-template/remote` | 远程组件模板 |
| Business Project | `@kne-template/project` | 业务项目模板 |
| WeChat Miniprogram Libs | `@kne-template/miniprogram-libs` | 微信小程序库模板 |
| WeChat Miniprogram Project | `@kne-template/miniprogram-project` | 微信小程序项目模板 |

#### 其他命令

| 命令 | 参数 | 说明 |
|------|------|------|
| `entryHtml` | - | 生成入口 HTML 文件 |
| `manifest` | - | 生成 manifest 清单文件 |

---

### 程序化 API

#### 导出方法

| 方法名 | 参数 | 返回值 | 说明 |
|--------|------|--------|------|
| `getLatestVersion(name)` | `name: string` | `Promise<string>` | 获取包最新版本 |
| `getNextMajorVersion()` | - | `Promise<string>` | 获取下一个主版本号 |
| `getNextMinorVersion()` | - | `Promise<string>` | 获取下一个次版本号 |
| `getNextPatchVersion()` | - | `Promise<string>` | 获取下一个修订号 |
| `getPackageInfo(key)` | `key: string` | `Promise<any>` | 获取 package.json 字段 |
| `initProject(name, template, version)` | - | `Promise<void>` | 初始化项目 |
| `deployPrompts(type)` | `type: string` | `Promise<void>` | 部署 prompts |
| `generateEntryHtml()` | - | `Promise<void>` | 生成入口 HTML |
| `generateManifest()` | - | `Promise<void>` | 生成 manifest |
| `deployManifest()` | - | `Promise<void>` | 部署 manifest |
| `deployPackage()` | - | `Promise<void>` | 部署 package |
| `deployProject()` | - | `Promise<void>` | 部署 project |

#### 使用示例

```javascript
const npmTool = require('@kne/npm-tools');

// 获取最新版本
const version = await npmTool.getLatestVersion('@kne/mini-core');

// 初始化项目
await npmTool.initProject('my-project', '@kne-template/libs');

// 部署 prompts
await npmTool.deployPrompts('frontend-libs');
```

---

### deployPrompts 输出结构

```
prompts/
├── prompts.json          # 部署记录（包名: 版本号）
├── prompts-libs/         # 按包名（不含 scope）组织
│   ├── README.md
│   └── *.md
├── prompts-remote-components/
│   ├── README.md
│   └── *.md
└── ...
```

**prompts.json 结构：**

```json
{
  "@kne/prompts-libs": "1.0.0",
  "@kne/prompts-remote-components": "2.1.0"
}
```
