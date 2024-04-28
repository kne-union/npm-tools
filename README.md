
# npm-tools


### 描述

发布npm包的一些工具脚本


### 安装

```shell
npm i --save @kne/npm-tools
```


### 概述

node lib 集成

### latestVersion

获取想要知道的包最后版本

```shell
 npx @kne/npm-tools latestVersion @kne/mini-core 
```

output:

```text
2.1.5
```

### nextMajorVersion

在自己项目中运行。
获取当前版本号后通过计算进行修改，比如原本版本号为 1.0.0，修改后为 2.0.0

```shell
npx @kne/npm-tools nextMajorVersion
```

### nextMinorVersion

在自己项目中运行。
获取当前版本号后通过计算进行修改，比如原本版本号为 1.0.0，修改后为 1.1.0

```shell
npx @kne/npm-tools nextMajorVersion
```

### nextPatchVersion

在自己项目中运行。
获取当前版本号后通过计算进行修改，比如原本版本号为 1.0.0，修改后为 1.0.1

```shell
npx @kne/npm-tools nextMajorVersion
```

### download

参考[@kne/fetch-npm-package](https://www.kne-union.top/#/node-libs/fetch-npm-package)

```shell
npx @kne/npm-tools download [npm-package-name]
```

### entryHtml

1. 获取环境变量中的 部署地址（DEPLOY_URL）、APP_NAME、VERSION
2. 将 [APP_NAME]、"static/js"、"remoteEntry.js" 匹配为 URL 
3. 获取入口文件，创建一个新的 DOM 环境，并在其中加载刚获取到的入口文件内容 
4. 拿到 dom 环境的 window，将匹配的 URL 转换到 window 的 head 中
5. 生成 script 标签，声明 runtimeAppName、runtimePublicUrl 以及 runtimeEnv 参数并赋值
6. 将 dom 序列化后的内容写入口文件

```shell
npx @kne/npm-tools entryHtml
```

### manifest
1. 获取导出地址
2. 创建 readme 和 list 文件夹
3. 读取配置文件信息并返回新的数据
    * 当前目录下，读取环境变量中的 [MANIFEST_FILE] 文件或者 package.json 配置文件
    * 将文件内容的 manifest-config 数据重新循环，获取配置中的包名在 npm 中的信息，配置生成新的数据
4. 定义 readme json 数据集合
5. 将获取到的数据转换，生成新的 manifest.json 文件，并将定义路径和数据放入 readme 数据集合中
6. 将获取到的数据转换中所有远程加载的包写入 remote-components.json 中
7. 将 readme 数据集合中的数据分类写入 readme 文件夹内 
8. 将 readme 数据集合中的数据写入 list 文件夹内

***list 文件夹主要储存从 npm 中获取到的包数据***
***readme 文件夹主要储存每个库中包的 readme 文件数据***

```shell
npx @kne/npm-tools manifest
```

### init

可以使用 npm-tools 创建一个预置的模板项目

```shell
npx @kne/npm-tools init [project-name] [template-name]
```

project-name 必填，为创建的项目名，template-name 可选，没有指定的时候会有以下六种模板可供选择，指定的话（如：cra-template）将会使用指定的模板进行创建

共有六种模板类型可供选择

- NodeJS Libs [@kne-template/node](https://npmmirror.com/package/@kne-template/node)
- Frontend Libs [@kne-template/libs](https://npmmirror.com/package/@kne-template/libs)
- Remote Components [@kne-template/remote](https://npmmirror.com/package/@kne-template/remote)
- Business Project [@kne-template/project](https://npmmirror.com/package/@kne-template/project)
- WeChat Miniprogram Libs [@kne-template/miniprogram-libs](https://npmmirror.com/package/@kne-template/miniprogram-libs)
- WeChat Miniprogram
  Project [@kne-template/miniprogram-project](https://npmmirror.com/package/@kne-template/miniprogram-project)



### 示例

#### 示例代码



### API

发布npm包的一些工具脚本
