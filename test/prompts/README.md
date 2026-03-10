# Prompts 文档索引

本文档集合包含多个 AI 提示词文档，用于指导前端开发、组件库使用、文档生成等常见任务的规范化执行。

## 文档集合列表

### 1. prompts-node-libs

**版本**: v1.0.0

**功能**: 提供项目文档生成的规范指导

**适用场景**:

- 需要为项目生成规范化的文档
- 创建项目概述文档和 API 文档

**核心内容**:

- 生成文档：指导生成 summary.md 和 api.md，规范文档格式

---

### 2. prompts-projects

**版本**: v1.0.0

**功能**: 提供前端开发辅助提示词，指导 AI 完成组件国际化、业务模块创建等任务

**适用场景**:

- React 组件的国际化改造
- 基于 BizUnit 架构创建业务模块

**核心内容**:

- 业务组件国际化：HOC 包裹、语言包创建、不同组件类型的国际化模式
- 创建业务模块：BizUnit 配置、列表配置、表单组件、详情页开发

---

### 3. prompts-remote-components

**版本**: v1.0.2

**功能**: 提供前端组件库相关的代码模块、文档和示例生成指导

**适用场景**:

- 生成完整的 CRUD 业务模块
- 远程模块加载与微前端架构
- 构建复杂表单页面
- 组件国际化改造
- 文档和示例编写

**核心内容**:

- BizUnit使用指南：模块目录结构、核心组件实现、国际化规范
- RemoteLoader使用指南：四种使用方式、API 参考、性能优化
- FormInfo使用指南：表单组件、字段类型、校验规则、分步表单
- 国际化：文件创建、组件修改模式、语言包命名规范
- 生成文档：项目概述和 API 文档格式规范
- 组件示例编写提示词：示例代码规范、配置结构、设计原则

---

## 快速选择指南

| 需求                 | 推荐文档                 | 所属集合                                         |
|--------------------|----------------------|----------------------------------------------|
| 生成项目概述文档           | 生成文档                 | prompts-node-libs                            |
| 生成 API 文档          | 生成文档                 | prompts-node-libs                            |
| 组件需要支持多语言          | 业务组件国际化 / 国际化        | prompts-projects / prompts-remote-components |
| 创建新的业务模块（列表、表单、详情） | 创建业务模块 / BizUnit使用指南 | prompts-projects / prompts-remote-components |
| 构建微前端架构            | RemoteLoader使用指南     | prompts-remote-components                    |
| 动态加载远程模块           | RemoteLoader使用指南     | prompts-remote-components                    |
| 构建复杂表单页面           | FormInfo使用指南         | prompts-remote-components                    |
| 为组件编写示例代码          | 组件示例编写提示词            | prompts-remote-components                    |
