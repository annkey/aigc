# Project Structure

这个文件给开发者和 Codex 用，目标是减少每次任务都要全仓扫描的成本。

## 优先阅读顺序

1. `README.md`
2. `AGENTS.md`
3. 当前任务直接相关的 1 到 3 个文件

## 关键入口

- `server.js`
  - Node.js HTTP 服务入口
  - 负责静态资源分发、`/api/config`、生成任务、任务查询、模型优化代理
  - 如果只改前端显示，不要先读这个文件

- `public/index.html`
  - 主生成页结构
  - 包含文本生成、图片生成、模型优化两个工作区

- `public/app.js`
  - 主生成页运行逻辑
  - 负责表单提交、任务轮询、结果展示、状态提示
  - 现在只放页面行为，不再承载大段平台配置

- `public/app-config.js`
  - 主生成页的稳定配置
  - 包含 provider 名称、模型版本、质量选项、文案提示
  - 调整平台选项、默认模型、提示文案时优先改这里

- `public/model-preview.html`
  - 本地 3D 预览页结构
  - 包含播放器、工具栏、生成弹窗、优化弹窗、模型列表弹窗

- `public/model-preview.js`
  - 本地 3D 预览主逻辑
  - 负责 Three.js 初始化、文件加载、统计信息、任务轮询、播放控制
  - 这个文件仍然较大，后续适合继续按“加载器 / UI / 任务管理 / 立体显示”拆分

- `public/model-preview-utils.js`
  - 预览页纯辅助函数
  - 包含状态文案、任务进度映射、时间/大小格式化、可播放模型解析、下载名清洗
  - 修改这些通用规则时优先改这里

- `public/model-preview-task-list.js`
  - 预览页任务列表与本地存储逻辑
  - 包含生成任务记录排序、列表渲染、按钮绑定、进度浮层更新
  - 修改任务列表展示或本地持久化逻辑时优先改这里

- `public/model-preview-config.js`
  - 预览页的稳定配置
  - 包含 provider 选项、存储 key、立体显示参数、默认全景图常量
  - 调整默认行为时优先改这里

- `public/styles.css`
  - 主生成页样式

- `public/model-preview.css`
  - 预览页样式

## 低成本任务入口

- 改主生成页文案或默认选项：
  - 先看 `public/app-config.js`

- 改主生成页交互：
  - 先看 `public/app.js`

- 改预览页文案或默认参数：
  - 先看 `public/model-preview-config.js`

- 改预览页加载或工具栏逻辑：
  - 先看 `public/model-preview.js`

- 改预览页状态文案、任务列表展示或下载名规则：
  - 先看 `public/model-preview-utils.js`

- 改预览页生成任务列表、进度浮层或本地任务记录：
  - 先看 `public/model-preview-task-list.js`

- 改接口代理或任务状态归一化：
  - 先看 `server.js`

## 最小验证建议

- 后端改动：
  - `node --check server.js`

- 主生成页改动：
  - 打开 `/`
  - 检查表单切换、状态提示、结果卡片是否正常

- 预览页改动：
  - 打开 `/model-preview.html`
  - 检查 `/vendor/three/build/three.module.js` 可访问
  - 检查模型加载、错误提示、工具栏按钮是否正常

## 给 Codex 的提示词模板

```text
只处理 [具体文件]。
目标是 [一个明确问题]。
不要扫描整个仓库，不要顺带重构其他模块。
验证只做 [最小命令或最小页面检查]。
完成后只汇报：改了什么、验证了什么、还没验证什么。
```
