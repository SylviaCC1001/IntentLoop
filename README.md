# PRD Hub

PRD Hub 是一个本地优先的需求方案托管与评审系统。它把一个需求方案拆成三类核心资产：PRD、交互原型、附录说明，并围绕这些资产提供上传、版本留存、在线预览、编辑发版、评审注释和评审上下文导出能力。

当前项目仍处于本地 MVP 阶段，默认使用 SQLite 和本地文件目录保存数据，不包含多租户、外部分享和细粒度权限系统。

## 当前功能

### 1. 需求方案管理

- `/projects` 展示需求方案列表。
- 支持新建需求方案，字段包括名称、描述和主色。
- 每个需求方案进入 `/solutions/[id]` 详情页。
- 需求方案详情页按资产分区展示：
  - PRD
  - 交互原型
  - 附录说明
  - 评审问题台账

> 代码层仍沿用早期的 `projects` 表和部分 `/api/projects` 命名，产品 UI 上已经统一表达为“需求方案”。

### 2. PRD 管理

- 支持上传 `.md` 文件作为 PRD。
- 支持平台内 Markdown 二次编辑。
- 编辑页采用左侧编辑、右侧实时预览。
- 点击“发版”后会生成新的 PRD 版本。
- 支持版本历史、当前版本标记、历史版本 Diff、回滚。
- Markdown 预览支持：
  - 标题、段落、列表、引用
  - 表格、任务列表等 GFM 语法
  - 代码块和语法高亮
  - KaTeX 数学公式
  - Mermaid 图表

### 3. PRD 评审注释

- PRD 评审模式是只读渲染视图。
- 用户可以直接在渲染后的 Markdown 页面中选中文字并添加注释。
- 注释右侧面板可收起。
- 点击已标注文本可唤起对应注释。
- 已解决的注释会从当前评审视图中移除。

### 4. 交互原型管理

- 支持上传单 HTML 文件。
- 支持上传包含 `index.html` 的 zip 原型包。
- 每次上传 PRD 或交互原型都会保留为一次版本记录。
- 单 HTML 原型会同时保存 HTML 文本内容和可预览文件。
- zip 原型会解压到本地 `data/prototypes` 目录，用 `/proto/[...path]` 托管访问。

### 5. 原型沙盘

交互原型在“原型沙盘”中预览，当前支持：

- iframe 沙箱预览。
- 允许运行脚本、表单、弹窗和全屏。
- 新窗口打开。
- 刷新当前预览。
- 全屏查看。
- 原型版本切换。
- 固定常见桌面画布尺寸预览。
- 单 HTML 文本热修：
  - 开启编辑模式后点击页面文字可直接修改。
  - 可保存为新的 HTML 版本。
  - 可导出编辑后的 HTML。
  - zip 多文件原型暂不支持直接保存新版，但可导出当前序列化 HTML。

### 6. 原型评审注释

- 原型评审采用元素命中标注，不是手动画矩形。
- 开启标注模式后，鼠标悬停页面元素会自动框选可交互区域。
- 点击元素后在右侧轻量评论区添加注释。
- 注释绑定到：
  - 当前原型版本
  - 当前页面路径
  - 页面 key
  - viewport
  - DOM selector / xpath / tag / id / class / role / text fingerprint
  - 元素 bbox
- 切换版本或刷新预览时会重新同步当前页面可定位的注释标记。
- 注释面板默认可收起，点击标记或评论卡片可重新聚焦。

### 7. 联合评审

- 交互原型支持“联合评审”模式。
- 默认是原型主视图 + PRD 副视图。
- 左侧 PRD 对照窗口宽度可拖拽调整。
- 左侧应用导航栏可收起，给评审画布留出更多空间。
- 注释区在联合评审中默认收起，降低干扰。

### 8. 附录说明

- 支持上传图片、PDF、Excel、文本等补充材料。
- 附录在需求方案详情页聚合展示。
- 附录支持下载。
- 附录说明不做版本历史。

### 9. 评审问题台账与上下文导出

- 需求方案详情页展示评审问题台账。
- 注释状态支持：
  - 待处理
  - 已处理
  - 已关闭
- `/board` 提供按状态聚合的评审看板。
- 支持从需求方案详情页导出评审上下文 Markdown。
- 导出的上下文包含：
  - 需求方案信息
  - 文档与版本摘要
  - 评审问题台账
  - 可供 Coding Agent 或 AI 分析的结构化 JSON

## 技术栈

### 前端

- Next.js 15 App Router
- React 19
- TypeScript
- Tailwind CSS
- lucide-react 图标
- react-markdown
- remark-gfm
- remark-math
- rehype-katex
- rehype-highlight
- mermaid
- @uiw/react-md-editor 依赖已引入，当前核心编辑器以轻量 textarea + 预览组件实现

### 后端与数据

- Next.js Route Handlers
- SQLite 本地数据库
- Drizzle ORM
- 自定义 `NodeSqliteDatabase` 适配层
- bcryptjs 密码哈希
- jose / Cookie Session 鉴权
- zod 参数校验

### 文件与版本

- isomorphic-git：为 PRD 和单 HTML 保存提交记录。
- adm-zip：处理 zip 原型包上传与解压。
- diff：生成历史版本差异。
- 本地文件目录：
  - `data/prd.db`：SQLite 数据库
  - `data/repos`：每个文档的 git 仓库
  - `data/prototypes`：HTML / zip 原型预览文件
  - `data/appendices`：附录文件

## 数据模型

核心表：

- `users`：用户、角色、头像颜色。
- `projects`：需求方案。
- `documents`：需求方案下的资产，类型包括 `md`、`html`、`html-zip`、`appendix`。
- `versions`：PRD 和交互原型版本记录；附录只保留当前文件记录。
- `comments`：评审注释，支持文本选区和 HTML 元素锚点。
- `status_logs`：文档状态变更日志。
- `sessions`：登录会话。

## 主要页面

- `/`：根据登录状态跳转。
- `/login`：登录。
- `/register`：邀请码注册。
- `/projects`：需求方案列表。
- `/solutions/[id]`：需求方案详情、资产管理、版本摘要、评审台账。
- `/docs/[id]?mode=edit`：PRD 编辑。
- `/docs/[id]?mode=review`：PRD 评审或原型评审。
- `/docs/[id]?mode=joint`：原型 + PRD 联合评审。
- `/board`：评审问题看板。
- `/proto/[...path]`：本地原型静态托管和 iframe 注入运行时。

## 主要 API

### 鉴权

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/logout`

### 需求方案

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/[id]`
- `PATCH /api/projects/[id]`
- `DELETE /api/projects/[id]`
- `POST /api/solutions/[id]/assets`
- `GET /api/solutions/[id]/review-context`

### 文档与版本

- `GET /api/documents`
- `POST /api/documents`
- `POST /api/documents/import`
- `GET /api/documents/[id]`
- `PATCH /api/documents/[id]`
- `DELETE /api/documents/[id]`
- `GET /api/documents/[id]/versions`
- `POST /api/documents/[id]/versions`
- `GET /api/documents/[id]/versions/[vid]`
- `POST /api/documents/[id]/versions/[vid]/rollback`
- `GET /api/documents/[id]/diff`
- `POST /api/documents/[id]/upload`

### 评论与附件

- `GET /api/documents/[id]/comments`
- `POST /api/documents/[id]/comments`
- `PATCH /api/comments/[id]`
- `DELETE /api/comments/[id]`
- `POST /api/comments/[id]/resolve`
- `GET /api/appendices/[id]/download`

## 本地启动

### 1. 安装依赖

```bash
npm install
```

### 2. 配置环境变量

复制 `.env.example` 为 `.env.local`，或直接使用当前本地配置。

关键配置：

```bash
DATABASE_URL=./data/prd.db
SESSION_SECRET=local-dev-secret-please-change-in-production-32chars
INVITE_CODE=PRD2026
DATA_DIR=./data
MAX_UPLOAD_SIZE_MB=50
```

### 3. 初始化数据库

```bash
npm run db:migrate
```

当前仓库的 `package.json` 中有 `db:seed` / `setup` 脚本，但代码库里没有对应的 `src/lib/db/seed.ts`。本地初始化建议先运行 `db:migrate`，再通过 `/register` 注册第一个账号。

默认邀请码：

```text
PRD2026
```

第一个注册用户会自动成为管理员。

### 4. 启动开发服务

```bash
npm run dev
```

默认访问：

```text
http://localhost:3000
```

## 测试与验证

常用命令：

```bash
npm run lint
npm run build
npm run test:pages
npm run test:smoke
npm run test:comments
```

说明：

- `test:pages` 会验证关键页面和部分接口闭环。
- `test:smoke` 当前包括数据库、评论、原型注入、原型标注等 smoke 测试。
- `build` 和本地 `dev` 都会写 `.next`，如果开发服务正在运行，建议先停止服务再构建；构建后再重新启动 `npm run dev`。

## 当前边界

- 暂未实现权限与分享功能。
- 暂未实现多人实时协同编辑。
- 暂未接入 AI，只提供可导出的评审上下文，方便交给本地 Coding Agent 或其他 AI 工具分析。
- zip 多文件原型支持预览和标注，但不支持直接在平台内保存为新版 zip。
- 原型评审锚点依赖 DOM selector、xpath、文本和 fingerprint；如果原型版本 DOM 变化很大，旧注释可能无法在新页面稳定定位。
- 附录说明不做版本历史。

## 推荐工作流

1. 创建需求方案。
2. 上传 PRD Markdown。
3. 在平台内进行 PRD 二次编辑，点击“发版”形成版本。
4. 上传 HTML 或 zip 交互原型。
5. 使用联合评审同时查看原型和 PRD。
6. 对 PRD 文本选区或原型元素添加评审注释。
7. 在需求方案详情页跟踪评审问题台账。
8. 需要集中处理时导出评审上下文，交给 Coding Agent 或 AI 做分析。
