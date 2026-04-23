# 3D AIGC Platform

一个基于原生 Node.js 的 3D AIGC 小工具，支持：
- Tripo3D 文本生成 3D 模型
- Tripo3D 图片生成 3D 模型
- Meshy 文本生成 3D 模型
- Meshy 图片生成 3D 模型
- 本地 3D 模型网页预览

## 本地启动

```powershell
npm start
```

默认地址：
- http://localhost:3000
- http://localhost:3000/model-preview.html

## 项目结构

- `server.js`
  - 后端入口，负责静态资源、配置接口、生成任务、任务查询、模型优化代理
- `public/index.html`
  - 主生成页结构
- `public/app.js`
  - 主生成页交互逻辑
- `public/app-config.js`
  - 主生成页稳定配置，包括 provider、模型版本、选项与文案
- `public/model-preview.html`
  - 本地 3D 预览页结构
- `public/model-preview.js`
  - 本地 3D 预览页主逻辑
- `public/model-preview-utils.js`
  - 预览页纯辅助函数，包括状态文本、任务进度、时间/大小格式化、下载名清洗、错误文案
- `public/model-preview-task-list.js`
  - 预览页生成任务列表与本地存储逻辑，包括列表渲染、任务记录排序、存取、进度浮层更新
- `public/model-preview-config.js`
  - 预览页稳定配置，包括 provider、默认参数、storage key、立体显示参数
- `public/styles.css`
  - 主生成页样式
- `public/model-preview.css`
  - 预览页样式
- `docs/project-structure.md`
  - 面向开发者和 Codex 的低成本上下文说明，包含改动入口和最小验证建议

## 给 Codex 的最小上下文

如果你想减少单次任务的额度消耗，建议提示词直接限制到具体文件和动作，例如：

```text
只处理 public/app.js 和 public/app-config.js。
目标是调整主生成页的默认模型版本和提示文案。
不要扫描整个仓库，不要改 server.js。
验证只做最小页面检查。
完成后只汇报：改了什么、验证了什么、还没验证什么。
```

## 必填环境变量

```env
TRIPO_API_KEY=tsk_xxx
MESHY_API_KEY=msy_xxx
PORT=3000
```

本地开发可以放到 `.env.local`。
部署到云平台时，请在平台面板中配置环境变量，不要把真实密钥提交到仓库。

## 外网部署

### 方案一：Railway

适合直接把项目发布成公网网站。

1. 把代码推到 GitHub。
2. 在 Railway 创建一个新的 Web Service。
3. 连接这个仓库。
4. 如果平台检测到 Dockerfile，会直接按 Dockerfile 构建。
5. 在 Railway 的 Variables 中配置：
   - `TRIPO_API_KEY`
   - `MESHY_API_KEY`
   - `PORT=3000`
6. 部署完成后，Railway 会分配一个公网域名。

也可以使用 Railway CLI：

```powershell
railway up
```

### 方案二：任意支持 Docker 的云主机

项目已包含 Dockerfile，可直接构建：

```powershell
docker build -t aigc-3d-platform .
docker run -p 3000:3000 -e TRIPO_API_KEY=tsk_xxx -e MESHY_API_KEY=msy_xxx aigc-3d-platform
```

然后将 `3000` 端口通过云服务器安全组或反向代理暴露到外网。

## 健康检查

部署后可用以下地址检查服务是否在线：

```text
/healthz
```

返回示例：

```json
{
  "ok": true
}
```

