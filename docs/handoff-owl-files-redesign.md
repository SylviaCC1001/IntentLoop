# IntentLoop Owl Files 风格重设计 - Handoff 文档

## 设计目标

将 PRD 托管站改造为 Owl Files 风格的 Web 应用：
- **视觉语言**：大圆角（14-24px）、低饱和度配色、轻阴影、更多留白
- **交互完整性**：补全缺失的删除/编辑功能
- **真实缩略图**：项目卡片显示方案名首字母，而非统一图标

---

## 已完成工作

### 1. 设计 Token 升级（`src/app/globals.css`）

**配色方案**（奶白+灰蓝）：
```css
:root {
  --background: #fafbfc;        /* 奶白背景 */
  --foreground: #1a1f2e;        /* 深蓝灰文字 */
  --card: #ffffff;              /* 纯白卡片 */
  --border: #e8ecf1;            /* 浅灰蓝边框 */
  --primary: #5b7ff5;           /* 蓝色主色 */
  --muted: #f3f5f7;             /* 静音背景 */
  --muted-foreground: #6b7280;  /* 次要文字 */
}
```

**圆角系统**（Owl Files 标准）：
```css
--radius-sm: 10px;   /* 小元素：按钮、徽章 */
--radius-md: 14px;   /* 中等：输入框、下拉 */
--radius-lg: 18px;   /* 大卡片：弹窗 */
--radius-xl: 24px;   /* 超大：主卡片 */
```

**阴影层级**（极轻微）：
```css
--shadow-elev-1: 0 1px 3px rgba(15, 23, 42, 0.02), 0 1px 2px rgba(15, 23, 42, 0.015);
--shadow-elev-2: 0 4px 10px rgba(15, 23, 42, 0.04), 0 2px 4px rgba(15, 23, 42, 0.02);
--shadow-elev-3: 0 12px 24px rgba(15, 23, 42, 0.06), 0 4px 8px rgba(15, 23, 42, 0.03);
```

---

### 2. 项目卡片真实缩略图（`src/app/(app)/projects/page.tsx`）

**纸张堆叠效果**：
- 三层纸张：`rotate-[-3deg]`, `rotate-[2deg]`, `rotate-[0deg]`
- 最前层显示方案名首字母大写，背景色用 `project.color`
- 底部色条用 `project.color` 半透明

**关键代码**：
```tsx
<div className="absolute left-1/2 top-1/2 flex h-[88%] w-[72%] -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center gap-3 rounded-xl border border-border bg-white p-6">
  <div
    className="flex h-16 w-16 items-center justify-center rounded-2xl text-3xl font-bold text-white"
    style={{ background: project.color }}
  >
    {project.name.charAt(0).toUpperCase()}
  </div>
  <div className="text-center">
    <div className="text-xs font-medium text-muted-foreground">
      {documentCount} 个资产
    </div>
  </div>
</div>
```

---

### 3. 删除/编辑功能补全

#### 3.1 通用操作菜单组件（`src/components/ActionsMenu.tsx`）

**新建文件**，提供 ⋯ 按钮 + 下拉菜单 + 确认弹窗：

```tsx
type ActionItem = {
  key: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  danger?: boolean;              // 危险操作（红色）
  confirmTitle?: string;         // 确认标题
  confirmDescription?: string;   // 确认描述
  confirmLabel?: string;         // 确认按钮文字（默认"确认"）
};

<ActionsMenu 
  ariaLabel="操作菜单"
  items={[
    { key: "edit", label: "编辑", icon: <Pencil />, onSelect: ... },
    { key: "delete", label: "删除", icon: <Trash2 />, danger: true, 
      confirmTitle: "删除 XXX？", 
      confirmDescription: "删除后无法恢复。",
      onSelect: ... }
  ]}
/>
```

**特性**：
- 点击外部自动关闭
- 阻止事件冒泡（防止触发父 Link）
- 危险项带 AlertTriangle 图标 + 红色强调

---

#### 3.2 项目操作组件（`src/components/ProjectActions.tsx`）

**新建文件**，封装需求方案的编辑/删除：

```tsx
<ProjectActions 
  project={{ id, name, description, color }} 
/>
```

**功能**：
- 编辑：调起 `ProjectCreateDialog` 的 `mode="edit"`
- 删除：调用 `DELETE /api/projects/:id`，警告文案："删除后,该方案下所有 PRD、原型、附录、版本和评论都会一并删除,无法恢复。"

---

#### 3.3 文档操作组件（`src/components/DocumentActions.tsx`）

**新建文件**，封装文档的编辑/删除：

```tsx
<DocumentActions 
  document={{ id, title, description, priority }}
  onDeleted={() => router.push('/projects')}  // 可选回调
/>
```

**功能**：
- 编辑：调起 `DocumentCreateDialog` 的 `mode="edit"`
- 删除：调用 `DELETE /api/documents/:id`，警告文案："删除后,该文档的所有版本、评论和原型文件都会一并删除,无法恢复。"

---

#### 3.4 弹窗重构支持编辑模式

**ProjectCreateDialog 改动**（`src/components/ProjectCreateDialog.tsx`）：
```tsx
type ProjectCreateDialogProps = {
  mode?: "create" | "edit";
  project?: ProjectFormProject;  // { id, name, description, color }
  open?: boolean;                // 受控模式
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;         // 隐藏默认按钮
  // ... 原有 props
};

// 编辑时调用 PATCH /api/projects/:id
// 创建时调用 POST /api/projects
```

**DocumentCreateDialog 改动**（`src/components/DocumentCreateDialog.tsx`）：
```tsx
type DocumentCreateDialogProps = {
  mode?: "create" | "edit";
  document?: DocumentFormDocument;  // { id, title, description, priority }
  projectId?: string;               // 编辑时可选
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  hideTrigger?: boolean;
  // ... 原有 props
};

// 编辑模式隐藏 type 选择器（类型创建后不可改）
// 编辑时调用 PATCH /api/documents/:id
```

---

### 4. 项目卡片 DOM 结构重构（`src/app/(app)/projects/page.tsx`）

**问题**：之前 `ProjectActions` 在 `<Link>` 内部，导致 `<a>` 标签嵌套 `<form>`/`<button>`（非法 HTML），浏览器拒绝执行事件。

**修复后结构**：
```tsx
<div key={project.id} className="group relative rounded-2xl transition-transform duration-300 hover:-translate-y-1.5">
  {/* ⋯ 菜单：绝对定位在右上角，hover 时显示 */}
  <div className="absolute right-3 top-3 z-20 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
    <div className="rounded-lg bg-card/80 backdrop-blur-sm shadow-elev-1">
      <ProjectActions project={{...}} />
    </div>
  </div>

  {/* 卡片主体：可点击跳转 */}
  <Link href={`/solutions/${project.id}`} className="block overflow-hidden rounded-2xl border border-border bg-card shadow-elev-1 transition-shadow hover:shadow-elev-2">
    {/* 缩略图 + 信息 */}
  </Link>
</div>
```

**关键点**：
- `ProjectActions` 与 `Link` 平级（都在外层 `div` 内）
- 阻止事件冒泡由 `ActionsMenu` 内部处理
- `focus-within` 保证键盘导航时菜单可见

---

### 5. 方案详情页集成（`src/app/(app)/solutions/[id]/page.tsx`）

在 `AssetCard` 组件内添加：
```tsx
<DocumentActions
  document={{
    id: document.id,
    title: document.title,
    description: document.description,
    priority: document.priority,
  }}
/>
```

**位置**：与 `AssetVersionSheet` 并列，显示在 PRD/原型卡片内容区。

---

## 未完成/待验证

### 1. 编辑弹窗打开问题（未解决）

**症状**：点击项目卡片右上角 ⋯ → 编辑，弹窗不出现。

**已排查**：
- ✅ DOM 结构已修复（`ProjectActions` 移出 `Link`）
- ✅ `.next` 缓存已清理（webpack chunk map 损坏已修复）

**待验证**：
- 重启 `npm run dev` 后测试编辑功能
- 检查浏览器 Console 是否还有报错
- 验证 `ProjectCreateDialog` 的 `open` 状态是否正确更新

---

### 2. 其他页面潜在问题

**可能存在相同问题的位置**：
- 文档列表页（如果有）的操作菜单
- 评论区的操作按钮
- 其他可能在 `<Link>` 内嵌套表单的地方

**建议全局搜索**：
```bash
grep -r "<Link" src/app | grep -A5 "Actions"
```

---

### 3. 数据库迁移（已手动完成，需文档化）

**执行过的 SQL**：
```sql
ALTER TABLE projects 
ADD COLUMN status TEXT NOT NULL DEFAULT 'draft' 
CHECK(status IN ('draft', 'reviewed', 'revised'));
```

**建议**：将此迁移加入 Drizzle 迁移文件，避免新环境部署时遗漏。

---

## API 端点清单

### 需求方案（Projects）
- `POST /api/projects` - 创建
- `PATCH /api/projects/:id` - 更新（名称/描述/颜色）
- `DELETE /api/projects/:id` - 删除（级联删除所有文档/版本/评论）

### 文档（Documents）
- `POST /api/documents` - 创建
- `PATCH /api/documents/:id` - 更新（标题/描述/优先级）
- `DELETE /api/documents/:id` - 删除（级联删除所有版本）

---

## 设计规范速查

| 元素 | 圆角 | 阴影 | 间距 |
|------|------|------|------|
| 主卡片 | 24px | elev-1 → elev-2 | p-6 |
| 弹窗 | 18px | elev-3 | p-5 |
| 按钮 | 10px | 无 | px-3 py-2 |
| 输入框 | 14px | 无 | px-3 py-2 |
| 统计卡 | 24px | elev-1 | p-6 |

**Hover 动效**：
- 卡片：`hover:-translate-y-1.5` + `shadow-elev-1 → elev-2`
- 按钮：`hover:opacity-90` 或 `hover:bg-muted`

---

## 技术债务

1. **GateGuard 拦截问题**：
   - 所有文件写入、Bash 命令都需要先陈述事实才能通过
   - 建议检查 `.claude/settings.json` 是否可以放宽权限

2. **webpack 缓存损坏**：
   - 每次 `npm install` 新包后建议主动 `rm -rf .next` 避免 chunk map 过期

3. **TypeScript 类型补全**：
   - `ProjectFormProject` / `DocumentFormDocument` 可抽到独立类型文件复用

---

## 移交清单

### 核心文件
- [x] `src/app/globals.css` - 设计 Token
- [x] `src/app/(app)/projects/page.tsx` - 项目列表（缩略图 + DOM 重构）
- [x] `src/app/(app)/solutions/[id]/page.tsx` - 方案详情（集成 DocumentActions）
- [x] `src/components/ActionsMenu.tsx` - 通用操作菜单
- [x] `src/components/ProjectActions.tsx` - 项目操作
- [x] `src/components/ProjectCreateDialog.tsx` - 项目创建/编辑弹窗
- [x] `src/components/DocumentActions.tsx` - 文档操作
- [x] `src/components/DocumentCreateDialog.tsx` - 文档创建/编辑弹窗

### 待修复
- [ ] 验证编辑弹窗是否正常打开（清缓存后重启 dev server）
- [ ] 全局搜索其他 Link 嵌套问题
- [ ] 补充 Drizzle 迁移文件（status 字段）

---

## 联系上下文

**用户评价**：
- "你改了个寂寞？设计元素呢？风格呢？" → 初版只改结构未改风格，已修复
- "纸张堆叠缩略图效果也不明显" → 已加大旋转角度 + 真实首字母缩略图
- "这个产品缺少了一些删除、重命名的功能" → 已补全，采用 ⋯ 菜单 + 确认弹窗模式
- "你为什么不能一次性搞完啊大哥？？" → GateGuard 多次拦截 + 编辑按钮 HTML 嵌套 bug

**最终状态**：`.next` 缓存已清，DOM 结构已修复，等待重启验证。
