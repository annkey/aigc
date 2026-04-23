# 3D AIGC Platform

一个基于原生 Node.js 的轻量 3D AIGC 工具集，当前包含：

- 官网门户页：`/`
- 3D 模型播放器：`/model-preview.html`
- 模型公共配置页：`/model-setting.html`
- Tripo3D 文本生成 3D 模型
- Tripo3D 图片生成 3D 模型
- Meshy 文本生成 3D 模型
- Meshy 图片生成 3D 模型
- Meshy AI 贴图
- 本地 3D 模型网页预览

## 本地启动

```powershell
npm start
```

默认地址：

- http://localhost:3000/
- http://localhost:3000/model-preview.html
- http://localhost:3000/model-setting.html

## 当前页面说明

- `/`
  - 官网门户页，展示产品定位、能力说明和进入播放器入口
- `/model-preview.html`
  - 3D 模型播放器，负责本地模型预览、AI 文生模 / 图生模、任务列表、模型贴图与空间交互能力
- `/model-setting.html`
  - 模型公共配置页，负责统一设置默认生成平台和模型版本

## 项目结构

- `server.js`
  - Node.js HTTP Server 入口
  - 负责静态资源分发、`/api/config`、生成任务、任务查询、模型优化代理、公共配置保存
- `public/index.html`
  - 官网门户页结构
- `public/app.js`
  - 官网门户页交互逻辑
- `public/app-config.js`
  - 官网门户页文案、模块配置和固定展示数据
- `public/styles.css`
  - 官网门户页样式
- `public/model-preview.html`
  - 3D 模型播放器结构
- `public/model-preview.js`
  - 播放器主逻辑，负责 Three.js 初始化、模型加载、任务提交、轮询与交互控制
- `public/model-preview-config.js`
  - 播放器稳定配置，包括 provider、默认参数、存储 key、立体显示参数
- `public/model-preview-utils.js`
  - 播放器辅助函数，包括状态文案、格式化、下载名处理、错误文案
- `public/model-preview-task-list.js`
  - 播放器任务列表、本地存储和任务浮层逻辑
- `public/model-preview.css`
  - 播放器样式
- `public/model-setting.html`
  - 模型公共配置页结构
- `public/model-setting.js`
  - 模型公共配置页逻辑
- `public/model-setting.css`
  - 模型公共配置页样式
- `public/vendor/three`
  - 本地 Three.js 运行时与加载器依赖
- `public/vendor/kmax`
  - 播放器立体显示和空间交互相关本地依赖
- `docs/project-structure.md`
  - 面向开发者和 Agent 的低成本上下文说明
- `generator-settings.json`
  - 运行时生成的公共配置文件，不属于核心源码

## 环境变量

```env
TRIPO_API_KEY=tsk_xxx
MESHY_API_KEY=msy_xxx
PORT=3000
GENERATOR_API_BASE=
```

说明：

- `TRIPO_API_KEY` 用于启用 Tripo3D 生成能力
- `MESHY_API_KEY` 用于启用 Meshy 生成与贴图能力
- 两个平台不要求同时配置；页面会根据后端可用配置决定默认平台
- 本地开发可使用 `.env.local`
- 不要把真实密钥提交到仓库

## 最小验证

后端改动后：

```powershell
node --check server.js
```

页面检查建议：

- 打开 `http://localhost:3000/`
- 打开 `http://localhost:3000/model-preview.html`
- 打开 `http://localhost:3000/model-setting.html`
- 检查 `http://localhost:3000/api/config`

## 部署

仓库保留了以下部署相关文件：

- `Dockerfile`
- `railway.json`
- `RAILWAY_DEPLOY.md`
- `ALIYUN_ECS_DEPLOY.md`
- `ECS_COMMANDS.md`

如果仍使用 Railway 或阿里云 ECS，这些文件可以继续保留；如果部署路径已经固定且不再需要这些说明文档，可按团队实际情况清理。
