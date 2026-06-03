# IntentLoop 产品需求托管平台完整规格

> 本文档根据当前仓库实现、此前交接信息以及最新需求变更还原。原始 session 文档已被删除，因此本文件作为新的基准规格文档维护在项目根目录。

## 1. 产品定位

IntentLoop 是面向产品需求方案的本地优先托管平台，用来集中管理一个需求从撰写、原型验证到评审闭环的核心资产。

平台的基本组织单位不再叫“项目”，而叫“需求方案”。一个需求方案由三类资产组成：

1. PRD：Markdown 文件，支持在线二次优化编辑、实时预览、评审注释和版本发布。
2. 交互原型：HTML 单文件或 zip 原型包，支持在线运行预览和版本记录。
3. 附录说明：图片、Excel、PDF、文本包等补充材料，只做聚合展示和下载，不做版本历史。

## 2. 产品目标

- 让已有 MD/HTML 文件可以被快速导入，而不是只能从空白文档开始。
- 让 PRD 的“编辑优化”和“评审批注”成为两个明确阶段，避免编辑区和评审区混在一起。
- 让 HTML/zip 原型像真实网页一样运行，而不是只显示静态 HTML 片段。
- 让每次 PRD 发版和原型上传都能留下可追溯的版本记录。
- 保持本地起步、单机可运行、SQLite 存储，不在第一阶段引入复杂协作基础设施。

## 3. 非目标

- 不做 SaaS 多租户、团队空间、权限矩阵。
- 不做在线富文本编辑器，PRD 编辑以 Markdown 为核心。
- 不做附录文件的版本历史。
- 原型沙盘第一阶段不做设备尺寸切换。
- 原型沙盘第一阶段不做诊断能力，包括缺失资源提示、JS 错误提示、危险协议处理、预览链接分享。
- 原型评审一期只做视觉区域标注，不读取 iframe 内部 DOM，不做 DOM 元素级绑定。

## 4. 已锁定决策

1. 本地起步：默认本机运行，数据落在本地 `data` 目录。
2. 数据库：SQLite，启用 WAL、foreign keys、busy timeout。
3. 注册：邀请码注册，默认邀请码为 `PRD2026`，首个注册用户为管理员。
4. 信息结构：需求方案下聚合 PRD、交互原型、附录说明三类资产。
5. PRD 编辑：左侧 Markdown 编辑，右侧实时预览；点击“发版”才形成新版本。
6. PRD 评审：独立预览模式，不展示左侧编辑栏；在渲染后的 Markdown 上选中文字添加注释。
7. 注释区：参考飞书文档，右侧注释面板可收起；点击正文高亮标记可唤起对应注释。
8. 已解决注释：直接删除，不保留 resolved 状态的可见问题。
9. 原型沙盘：使用 iframe 作为 HTML/zip 原型的运行容器，第一阶段只做完整运行预览和版本切换。
10. 原型评审：HTML 原型使用覆盖层视觉标注，锚点绑定版本、页面路径、viewport 和矩形区域。

## 5. 用户角色

### 管理员

- 由第一个注册用户自动成为管理员。
- 当前阶段管理员和普通成员的功能差异较小，后续可扩展为成员管理、删除权限、发布权限。

### 成员

- 可以登录、创建需求方案、上传 PRD/原型/附录、编辑 PRD、添加/解决注释。

## 6. 主流程

### 6.1 创建需求方案

入口：`/projects`。

用户点击“新建需求方案”，填写名称、描述、颜色。创建成功后停留在需求方案列表，并展示新卡片。卡片进入 `/solutions/[id]`。

字段规则：

- 名称必填，最多 64 字。
- 描述可空。
- 颜色从固定色板选择，默认 `#6366f1`。
- 提交中禁用按钮。
- API 错误在弹窗内展示。

### 6.2 需求方案详情

入口：`/solutions/[id]`。

页面展示三块资产：

1. PRD：上传 `.md`，进入编辑或评审。
2. 交互原型：上传 `.html/.htm/.zip`，进入原型沙盘预览。
3. 附录说明：上传任意补充文件，展示下载入口。

PRD 和交互原型在同一个需求方案内各自只保留一个主资产。重复上传同类文件时，不创建新的资产卡片，而是追加为该资产的新版本。附录每次上传创建一条独立附件记录。

### 6.3 PRD 二次优化编辑

入口：`/docs/[id]?mode=edit`，仅适用于 Markdown 文档。

界面要求：

- 左侧为 Markdown textarea。
- 右侧为实时预览。
- 预览支持 GFM 表格、任务列表、代码高亮、KaTeX 数学公式、Mermaid 图表。
- 用户编辑内容不会自动形成版本。
- 点击“发版”后调用版本 API，创建新的 PRD 版本并更新当前版本。
- 发版后展示版本历史。

### 6.4 PRD 评审注释

入口：`/docs/[id]?mode=review`，仅适用于 Markdown 文档。

界面要求：

- 页面只展示渲染后的 PRD 预览，不展示左侧编辑栏。
- 用户可以在正文中手动选中一段文字，然后添加注释。
- 正文中已有注释以高亮标记展示。
- 右侧为注释区，展示当前打开的注释列表和新增注释输入框。
- 注释区可以收起，收起后保留一个轻量入口和未处理数量。
- 点击正文高亮标记时，自动展开右侧注释区并定位对应注释。
- 注释卡片不展示“评论目标”等冗余字段，因为左侧高亮本身就是定位。
- 不提供整篇评论入口。
- 不提供回复按钮和回复输入框。
- 点击解决后直接删除该注释；如果一个文档内所有标记对应注释都被解决，正文标记自然消失。

### 6.5 交互原型沙盘

入口：`/docs/[id]`，适用于 `html` 和 `html-zip` 文档。

“原型沙盘”是一个基于 iframe 的版本化 HTML 原型运行环境。它的目标是让用户在平台内直接查看和操作 HTML 原型，尽量接近浏览器真实运行效果。

第一阶段范围：

- iframe 允许脚本运行。
- iframe 允许表单交互。
- zip 原型包完整解压并托管静态资源。
- zip 中的相对 CSS、JS、图片、字体等资源可以通过 `/proto/[...path]` 被访问。
- 工具栏提供刷新当前原型。
- 工具栏提供新窗口打开当前原型。
- 工具栏提供全屏查看当前原型。
- 工具栏提供版本切换，切换后预览指定版本。

第一阶段明确不做：

- 设备尺寸切换。
- 缺失资源诊断。
- JS 错误收集和展示。
- 外链或危险协议诊断处理。
- 预览链接分享。

安全边界：

- 原型运行在 iframe 中，不直接把 HTML 注入宿主页 DOM。
- iframe sandbox 应允许 `allow-scripts`、`allow-forms`，并按交互需要允许 `allow-modals`、`allow-popups`。
- 第一阶段不默认加入 `allow-same-origin`，避免原型脚本获得与宿主页相同源的能力。
- 静态资源路由必须做路径穿越防护，拒绝空段、`.`、`..`、绝对路径和越界访问。

### 6.6 交互原型评审注释

入口：`/docs/[id]` 原型沙盘内，适用于 `html` 和 `html-zip` 文档。

HTML 原型评审不能按 PRD 的文本选区方式处理，因为 iframe 内部 DOM 可能来自不同工具、结构不稳定、脚本复杂，且当前安全策略不开放 `allow-same-origin`。因此一期采用视觉标注：

- 用户点击“标注模式”后，在 iframe 上方启用透明标注层。
- 用户可以点击某个位置或拖拽一个矩形区域。
- 完成一次点击或拖框后自动退出标注模式，避免覆盖层继续拦截原型操作。
- iframe 内部页面加载或跳转时，宿主收起已显示的评审层并清理未提交草稿，但不读取 iframe DOM，也不强行退出正在进行的一次标注。
- 未提交的草稿标注在刷新沙盘、切换版本或 iframe 页面加载时自动清理。
- 已提交的视觉标注默认不叠加在原型上，用户通过“显示标注/隐藏标注”显式打开或收起评审层，避免影响原型浏览和操作。
- 右侧“原型评审”面板展示评论输入框。
- 提交后右侧显示对应评论卡片；评审层打开时，在原型上显示编号标注框。
- 点击标注框可以聚焦右侧评论。
- 点击解决后直接删除该评论和对应标注框。

锚点数据保存到 `comments.anchor_data`：

- `type`: `element`
- `kind`: `prototype-rect`
- `versionId`: 通过 `comments.version_id` 绑定当前原型版本
- `pagePath`: 当前 iframe 预览路径
- `viewport`: 标注时 iframe 可视区域宽高
- `bbox`: 百分比坐标 `{ x, y, w, h }`
- `preview`: 标注摘要
- `body`: 评论正文

一期不做：

- iframe DOM 节点选择器绑定。
- iframe 内页面滚动位置追踪。
- 跨页面路径自动迁移。
- 截图片段保存。
- 回复线程。

### 6.7 附录说明

入口：`/solutions/[id]`。

附录说明用于聚合补充材料，例如图片、PDF、Excel、调研文本、说明包等。

规则：

- 附录不参与版本历史。
- 每次上传生成一个独立附件卡片。
- 附件支持下载。
- 附件不会进入 PRD 编辑和原型沙盘。

### 6.8 评审看板

入口：`/board`。

第一阶段作为轻量评审入口，用于集中查看待评审需求和文档状态。后续可扩展为按状态、负责人、优先级、未解决注释数量聚合。

## 7. 页面与路由

### 应用页面

- `/`：根据登录态跳转。
- `/login`：登录。
- `/register`：邀请码注册。
- `/projects`：需求方案列表和创建入口。
- `/solutions/[id]`：需求方案详情，展示 PRD、交互原型、附录说明。
- `/docs/[id]?mode=edit`：PRD 编辑模式。
- `/docs/[id]?mode=review`：PRD 评审模式。
- `/docs/[id]`：HTML/zip 原型沙盘。
- `/board`：评审看板。
- `/proto/[...path]`：原型静态资源托管。

### API

- `POST /api/auth/register`：注册并创建 session。
- `POST /api/auth/login`：登录。
- `POST /api/auth/logout`：登出。
- `GET /api/projects`：需求方案列表。
- `POST /api/projects`：创建需求方案。
- `GET/PATCH/DELETE /api/projects/[id]`：需求方案详情、更新、删除。
- `GET /api/documents`：文档列表。
- `POST /api/documents`：创建文档。
- `POST /api/documents/import`：导入已有 `.md/.html/.zip` 文件。
- `GET/PATCH/DELETE /api/documents/[id]`：文档详情、更新、删除。
- `GET/POST /api/documents/[id]/versions`：版本列表和创建版本。
- `GET /api/documents/[id]/versions/[vid]`：版本详情。
- `POST /api/documents/[id]/versions/[vid]/rollback`：回滚为新版本。
- `GET /api/documents/[id]/diff`：版本差异。
- `POST /api/documents/[id]/comments`：创建 PRD 选区注释或原型视觉标注。
- `GET /api/documents/[id]/comments`：按版本读取注释。
- `DELETE /api/comments/[id]`：删除注释，用于“解决即删除”。
- `POST /api/solutions/[id]/assets`：按需求方案上传 PRD、原型、附录。
- `GET /api/appendices/[id]/download`：下载附录。

## 8. 数据模型

### users

- `id`
- `email`
- `password_hash`
- `display_name`
- `avatar_color`
- `role`: `admin | member`
- `created_at`

### projects

当前数据库表名仍为 `projects`，产品语义为“需求方案”。

- `id`
- `name`
- `description`
- `color`
- `created_by`
- `created_at`
- `updated_at`

### documents

用于承载需求方案下的资产。

- `id`
- `project_id`
- `title`
- `type`: `md | html | html-zip | appendix`
- `status`: `draft | reviewing | published | archived`
- `priority`: `P0 | P1 | P2 | P3`
- `tags`
- `owner_id`
- `current_version_id`
- `description`
- `created_at`
- `updated_at`

### versions

PRD 和交互原型的历史版本；附录只使用当前版本记录来保存下载信息，不展示版本历史。

- `id`
- `document_id`
- `commit_sha`
- `message`
- `content`
- `storage_path`
- `size`
- `created_by`
- `created_at`

存储规则：

- Markdown：`content` 保存 MD 文本，同时写入本地 git repo。
- HTML 单文件：`content` 保存 HTML 文本，同时写入 `data/prototypes/{docId}/{versionId}/index.html`。
- HTML zip：解压到 `data/prototypes/{docId}/{versionId}/`，`storage_path` 指向入口 `index.html`。
- 附录：文件保存到 `data/appendices/{solutionId}/{documentId}/`，`storage_path` 指向下载文件。

### comments

用于 PRD 评审注释和原型视觉标注。

- `id`
- `document_id`
- `version_id`
- `parent_id`
- `anchor_type`: `doc | block | element`
- `anchor_data`
- `body`
- `status`: `open | resolved`
- `is_orphaned`
- `created_by`
- `created_at`

当前产品交互中，解决注释走删除，因此可见列表只展示 `open` 注释。

原型视觉标注的 `anchor_data` 使用 `kind=prototype-rect`，并保存 `pagePath`、`viewport`、`bbox` 等字段。

### sessions

- `id`
- `user_id`
- `expires_at`
- `created_at`

## 9. Markdown 渲染能力

PRD 预览应支持：

- 标题、段落、粗体、斜体、删除线。
- 无序列表、有序列表、任务列表。
- 引用块。
- 表格。
- 行内代码和代码块。
- 代码高亮。
- 链接和图片。
- KaTeX 行内公式和块级公式。
- Mermaid 图表，包括 flowchart、sequence、pie 等常见图表。

Mermaid 渲染失败时，在预览中展示失败提示，不影响整页可用性。

## 10. 文件导入与上传

### 直接导入文档

文档导入的主入口应收敛到 `/solutions/[id]` 的三类资产上传区，不再把“全部文档”作为主导航入口。历史 `/docs?project=...` 路由可作为兼容入口暂时保留，但不应出现在主流程中。

本地路径导入已取消，不作为产品能力保留。用户只通过文件选择器上传本地文件。

### 需求方案资产上传

在 `/solutions/[id]` 中上传三类资产：

- PRD：只允许 `.md`。
- 交互原型：允许 `.html/.htm/.zip`。
- 附录说明：允许图片、PDF、Excel、文本等补充文件。

上传限制：

- 默认最大上传大小为 `MAX_UPLOAD_SIZE_MB`，未配置时为 50MB。
- zip 条目必须做路径安全校验。
- zip 必须包含 `index.html`，入口可以位于子目录。

## 11. 技术架构

### 前端

- Next.js App Router。
- React 19。
- Tailwind CSS。
- lucide-react 图标。
- Markdown 渲染使用 `react-markdown`、`remark-gfm`、`remark-math`、`rehype-katex`、`rehype-highlight`。
- Mermaid 使用客户端动态渲染。

### 后端

- Next.js Route Handlers。
- SQLite 通过 Node 内置 `node:sqlite` 封装接入 Drizzle。
- 本地文件存储在 `data` 目录。
- Git 版本提交使用 `isomorphic-git`，主要用于 PRD 和 HTML 文本类资产。

### 本地目录

- `data/prd.db`：SQLite 数据库。
- `data/repos/{documentId}`：文档 git repo。
- `data/prototypes/{documentId}/{versionId}`：HTML/zip 原型文件。
- `data/appendices/{solutionId}/{documentId}`：附录文件。

## 12. 验收标准

### 需求方案

- 登录后可以进入 `/projects`。
- 可以创建需求方案。
- 创建后列表出现卡片。
- 点击卡片进入 `/solutions/[id]`。

### PRD

- 可以上传 MD 作为 PRD。
- 重复上传 MD 追加版本，不创建第二个 PRD 卡片。
- 可以在平台内编辑 MD 并实时预览。
- 点击“发版”创建新版本。
- 评审模式隐藏编辑栏。
- 评审模式支持选中文字添加注释。
- 解决注释后正文高亮和右侧卡片消失。

### 交互原型

- 可以上传单 HTML。
- 可以上传包含 `index.html` 的 zip。
- zip 内 CSS、JS、图片等相对资源可以正常访问。
- 原型沙盘中 iframe 可以运行脚本和表单。
- 原型沙盘提供刷新、新窗口打开、全屏。
- 原型沙盘支持切换历史版本并预览对应版本。
- 原型沙盘支持标注模式，点击或拖框后可在右侧提交评论。
- 原型标注默认收起，不遮挡 iframe；点击显示标注后以编号框叠加在 iframe 上方。
- 原型标注绑定当前原型版本，切换版本后只显示该版本评论。
- 解决原型评论后对应编号框消失。
- 页面不出现设备尺寸切换能力。
- 页面不出现第三阶段诊断能力。

### 附录

- 可以上传多个附录文件。
- 附录在需求方案详情页聚合展示。
- 附录可下载。
- 附录不展示版本历史。

## 13. 测试计划

必跑命令：

```bash
npm run test:pages
npm run test:comments
npm run lint
npm run build
```

建议保留的 smoke 覆盖：

- `/projects` 返回 200 或认证跳转，不允许 404/500。
- `/solutions/[id]` 展示 PRD、交互原型、附录说明三块资产。
- PRD 重复上传形成同一文档的多个版本。
- 原型重复上传形成同一文档的多个版本。
- 附录重复上传形成多个独立附件。
- Markdown 全量语法样例渲染通过。
- Review 模式没有编辑器，有右侧注释面板。
- 解决注释后数据库删除该注释。
- `/proto/[...path]` 能托管 zip 资源。
- 原型沙盘页面包含刷新、新窗口、全屏、版本切换。
- 原型沙盘页面包含标注模式、显示/隐藏标注、原型评审面板；视觉标注框默认收起。

## 14. 后续路线

### P0：补齐原型沙盘第一阶段（已完成）

- 替换当前普通 iframe 预览为 `PrototypeSandbox` 客户端组件。
- iframe sandbox 允许脚本、表单、弹窗和模态。
- 增加刷新、新窗口打开、全屏。
- 增加版本选择器，切换后预览指定版本。
- 扩展 `pages-smoke` 覆盖沙盘能力。

### P0.5：原型视觉标注一期（已完成）

- 在原型沙盘中增加标注模式。
- 支持点击或拖框生成视觉标注。
- 右侧展示原型评审评论面板。
- 评论绑定具体原型版本。
- 解决评论后删除对应标注。

### P1：打磨需求方案详情

- 更清晰地展示三类资产的当前状态。
- PRD/原型版本记录增加更新时间、更新人、说明。
- 附录增加文件类型图标和大小信息。

### P2：评审看板

- 按需求方案聚合待处理注释数。
- 按状态、负责人、优先级筛选。
- 从看板直接跳转到 PRD 评审模式。

### P3：原型评审增强

- 标注绑定 iframe 内页面滚动位置。
- 支持截图片段保存。
- 支持跨页面路径聚合和筛选。
- 支持从看板跳转到具体原型标注。
