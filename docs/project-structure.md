# Project Structure

这个文件给开发者和 Agent 使用，目标是减少每次任务都全仓扫描的成本。

## 优先阅读顺序

1. `README.md`
2. `AGENTS.md`
3. 当前任务直接相关的 1 到 3 个文件

## 关键入口

- `server.js`
  - Node.js HTTP Server 入口
  - 负责静态资源分发、`/api/config`、`/api/generate`、`/api/task/:id`、`/api/model-optimize`、`/api/generator-settings`
  - 如果只改前端展示，一般不需要先读完整个文件

- `public/index.html`
  - 官网门户页结构

- `public/app.js`
  - 官网门户页运行逻辑
  - 负责滚动动画、门户内容渲染和页面标题等行为

- `public/app-config.js`
  - 官网门户页稳定配置
  - 包含品牌文案、功能卡片、统计数据和 CTA

- `public/model-preview.html`
  - 3D 模型播放器结构
  - 包含播放器、工具栏、指标区、生成弹窗、优化弹窗、任务列表弹窗

- `public/model-preview.js`
  - 3D 模型播放器主逻辑
  - 负责 Three.js 初始化、文件加载、模型统计、任务轮询、工具栏与空间交互

- `public/model-preview-config.js`
  - 播放器稳定配置
  - 包含 provider、模型版本、默认参数、存储 key、立体显示参数、默认全景图

- `public/model-preview-utils.js`
  - 播放器纯辅助函数
  - 包含状态文案、体积/时间格式化、下载名清洗、错误提示处理

- `public/model-preview-task-list.js`
  - 播放器任务列表与本地存储逻辑
  - 包含任务记录排序、列表渲染、按钮绑定和进度浮层更新

- `public/model-setting.html`
  - 模型公共配置页结构

- `public/model-setting.js`
  - 模型公共配置页逻辑
  - 负责读取 `/api/config`、展示可用平台、保存公共生成配置

- `public/styles.css`
  - 官网门户页样式

- `public/model-preview.css`
  - 播放器样式

- `public/model-setting.css`
  - 模型公共配置页样式

## 低成本任务入口

- 改官网门户文案或展示卡片：
  - 先看 `public/app-config.js`

- 改官网门户交互：
  - 先看 `public/app.js`

- 改播放器标题、文案或默认参数：
  - 先看 `public/model-preview.html`
  - 再看 `public/model-preview-config.js`

- 改播放器加载、工具栏或任务流程：
  - 先看 `public/model-preview.js`

- 改播放器状态文案、格式化或下载名：
  - 先看 `public/model-preview-utils.js`

- 改任务列表、本地记录或浮层：
  - 先看 `public/model-preview-task-list.js`

- 改公共生成平台和模型版本设置：
  - 先看 `public/model-setting.js`

- 改 API 代理、平台默认值或任务状态归一化：
  - 先看 `server.js`

## 最小验证建议

- 后端改动：
  - `node --check server.js`

- 官网门户页改动：
  - 打开 `/`
  - 检查标题、模块文案、主按钮链接是否正常

- 播放器改动：
  - 打开 `/model-preview.html`
  - 检查 `/vendor/three/build/three.module.js` 可访问
  - 检查播放器主界面、加载提示、错误提示是否正常

- 配置页改动：
  - 打开 `/model-setting.html`
  - 检查平台选择、模型版本切换、保存反馈是否正常
