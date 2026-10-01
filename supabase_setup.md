---
title: "阿鹏资讯站 - Supabase 建表与部署指南"
summary: "本文档包含阿鹏资讯站的完整Supabase建表SQL脚本（含四张表briefs/annotations/tracks/track_items及RLS行级安全策略配置）、Vercel部署步骤（连接GitHub仓库leonpeng8-dot/APeng-news自动部署静态站）、以及通过管理页面写入第一条测试简报的完整操作指南。按照步骤顺序执行即可完成全流程。"
---

# 阿鹏资讯站 - Supabase 建表与部署指南

## 第一步：Supabase 建表

### 1.1 登录 Supabase

1. 打开 [https://supabase.com](https://supabase.com)
2. 登录后进入项目：`https://vxlylfiyvorfcgxbympt.supabase.co`
3. 左侧菜单点击 **SQL Editor**
4. 点击 **New query**

### 1.2 执行建表 SQL

将以下 SQL **完整复制**到 SQL Editor 中执行：

```sql
-- ============================================
-- 阿鹏资讯站 数据库 Schema
-- ============================================

-- 简报/文章表
create table if not exists public.briefs (
  id uuid default gen_random_uuid() primary key,
  date date not null,
  period text not null check (period in ('早间','午间','晚间','夜间','专题')),
  title text not null,
  content text not null,
  items jsonb,
  tags text[],
  is_public boolean default true,
  created_at timestamptz default now()
);

-- 标注表（私密）
create table if not exists public.annotations (
  id uuid default gen_random_uuid() primary key,
  brief_id uuid references public.briefs(id) on delete cascade,
  selected_text text not null,
  annotation_type text not null check (annotation_type in ('star','important','track')),
  tags text[],
  note text,
  created_at timestamptz default now()
);

-- 追踪线索表
create table if not exists public.tracks (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  description text,
  tags text[],
  created_at timestamptz default now()
);

-- 追踪条目关联表
create table if not exists public.track_items (
  id uuid default gen_random_uuid() primary key,
  track_id uuid references public.tracks(id) on delete cascade,
  annotation_id uuid references public.annotations(id) on delete cascade,
  brief_id uuid references public.briefs(id) on delete cascade,
  created_at timestamptz default now()
);
```

### 1.3 创建索引

```sql
create index if not exists idx_briefs_date on public.briefs(date desc);
create index if not exists idx_briefs_period on public.briefs(period);
create index if not exists idx_briefs_tags on public.briefs using gin(tags);
create index if not exists idx_annotations_brief on public.annotations(brief_id);
create index if not exists idx_annotations_type on public.annotations(annotation_type);
create index if not exists idx_annotations_tags on public.annotations using gin(tags);
create index if not exists idx_track_items_track on public.track_items(track_id);
```

### 1.4 配置 RLS 策略

> ⚠️ 开发阶段：所有表公开可读写。生产环境请收紧为认证用户才能写入。

```sql
-- briefs 表
alter table public.briefs enable row level security;
create policy "briefs_read_all" on public.briefs for select using (true);
create policy "briefs_write_all" on public.briefs for insert with check (true);
create policy "briefs_update_all" on public.briefs for update using (true) with check (true);
create policy "briefs_delete_all" on public.briefs for delete using (true);

-- annotations 表
alter table public.annotations enable row level security;
create policy "annotations_read_all" on public.annotations for select using (true);
create policy "annotations_write_all" on public.annotations for insert with check (true);
create policy "annotations_update_all" on public.annotations for update using (true) with check (true);
create policy "annotations_delete_all" on public.annotations for delete using (true);

-- tracks 表
alter table public.tracks enable row level security;
create policy "tracks_read_all" on public.tracks for select using (true);
create policy "tracks_write_all" on public.tracks for insert with check (true);
create policy "tracks_update_all" on public.tracks for update using (true) with check (true);
create policy "tracks_delete_all" on public.tracks for delete using (true);

-- track_items 表
alter table public.track_items enable row level security;
create policy "track_items_read_all" on public.track_items for select using (true);
create policy "track_items_write_all" on public.track_items for insert with check (true);
create policy "track_items_delete_all" on public.track_items for delete using (true);
```

### 1.5 验证建表

在 SQL Editor 中执行：

```sql
select table_name from information_schema.tables 
where table_schema = 'public' 
order by table_name;
```

应返回：`annotations`、`briefs`、`track_items`、`tracks` 四张表。

---

## 第二步：推送代码到 GitHub

### 2.1 克隆仓库

```bash
git clone https://github.com/leonpeng8-dot/APeng-news.git
cd APeng-news
```

### 2.2 添加所有文件

将项目所有文件放入仓库目录：

```
APeng-news/
├── index.html
├── styles/main.css
├── js/app.js
├── js/supabase.js
├── js/annotation.js
├── admin/index.html
├── sql/schema.sql
├── README.md
└── supabase_setup.md
```

### 2.3 提交推送

```bash
git add -A
git commit -m "feat: 阿鹏资讯站完整系统 - 前端+数据库+划词标注+管理接口"
git push origin main
```

---

## 第三步：Vercel 部署

### 3.1 导入项目

1. 打开 [https://vercel.com](https://vercel.com)，登录
2. 点击 **Add New** → **Project**
3. 在 **Import Git Repository** 中找到 `leonpeng8-dot/APeng-news`
4. 点击 **Import**

### 3.2 部署配置

| 配置项 | 值 |
|---|---|
| Framework Preset | Other（自动检测为静态站） |
| Build Command | 留空（无需构建） |
| Output Directory | 留空（默认根目录） |
| Install Command | 留空 |

直接点击 **Deploy**。

### 3.3 验证部署

部署完成后（约 10-30 秒），Vercel 会分配一个域名：

- 首页：`https://apeng-news.vercel.app/`（或你自定义的域名）
- 管理页：`https://apeng-news.vercel.app/admin/`

打开首页应看到深色主题界面，侧边栏导航，空状态提示「今日暂无简报内容」。

---

## 第四步：写入第一条测试简报

### 4.1 进入管理页面

浏览器访问：`https://你的域名/admin/`

### 4.2 填写表单

| 字段 | 示例值 |
|---|---|
| 日期 | 2026-10-01（默认今天） |
| 时段 | 早间（默认根据当前时间） |
| 标题 | 2026年10月1日 早间简报（自动填充） |
| 标签 | A股, 美股, 加密 |
| 内容 | 见下方示例 |

### 4.3 示例 Markdown 内容

```markdown
## 美股三大指数涨跌不一

道琼斯工业指数收涨0.3%，纳斯达克指数微跌0.1%，标普500指数基本持平。
大型科技股表现分化，英伟达涨超2%，苹果小幅下跌。

## A股盘前预期

沪指有望在3100点附近获得支撑，市场关注成交量变化。
北向资金近期持续净流入，外资看好A股估值修复。

## 比特币突破65000美元

比特币夜间突破65000美元关口，24小时涨幅超3%。
以太坊同步上涨至3200美元附近，市场情绪转暖。
```

### 4.4 操作步骤

1. 粘贴上述内容到「简报内容」文本框
2. 点击 **👁️ 预览解析**，确认解析出 3 条新闻条目
3. 点击 **✅ 写入数据库**
4. 看到 ✅ 提示「写入成功！共 3 条」

### 4.5 验证效果

1. 打开首页 `https://你的域名/`
2. 点击侧边栏 **今日简报**
3. 应看到刚写入的简报，包含 3 张新闻条目卡片
4. 选中任意文字 → 弹出浮动菜单 → 点击 ⭐收藏
5. 点击侧边栏 **我的收藏** → 看到刚才的标注

---

## 第五步：后续使用

### AI 写入流程

火鸟生成简报后，可通过以下方式写入：

**方式 A：管理页面写入**

1. 访问 `/admin/`
2. 选择日期和时段
3. 粘贴 Markdown 内容
4. 提交写入

**方式 B：Supabase REST API 写入**

```bash
curl -X POST \
  'https://vxlylfiyvorfcgxbympt.supabase.co/rest/v1/briefs' \
  -H 'apikey: sb_publishable_cQdNwcX_i9NInAVCzUmWgQ_GJUMptIH' \
  -H 'Content-Type: application/json' \
  -H 'Prefer: return=representation' \
  -d '{
    "date": "2026-10-01",
    "period": "早间",
    "title": "2026年10月1日 早间简报",
    "content": "## 新闻标题\n正文内容...",
    "items": [{"title":"新闻标题","content":"正文内容..."}],
    "tags": ["A股","美股"],
    "is_public": true
  }'
```

### 日常使用

- **浏览简报**：打开首页，侧边栏切换「今日简报」「历史归档」
- **时段筛选**：在今日简报页点击「早间/午间/晚间/夜间」筛选
- **搜索**：顶部搜索框输入关键词，搜索全量简报
- **划词标注**：选中任意文字 → 弹菜单 → 收藏/标记重要/深度搜索/加备注
- **深度搜索**：选中文字 → 🔎 → 选择百度/Google/B站/微信搜索
- **我的收藏**：侧边栏点击 → 按类型筛选 → 搜索标注内容
- **追踪线索**：侧边栏点击 → 查看时间线 → 同标签自动串联

---

## 故障排查

| 问题 | 解决方案 |
|---|---|
| 首页显示「加载失败」 | 检查 Supabase 是否正常执行了建表 SQL |
| 管理页写入失败 | 检查 RLS 策略是否已执行 |
| 标注保存失败 | 检查 `annotations` 表和 RLS 策略 |
| CDN 加载慢 | jsdelivr 在国内偶尔慢，可换 `unpkg.com` |
| 微信内打不开搜索 | 已用剪贴板复制替代 `window.open`，需手动粘贴到浏览器 |

## 生产环境安全建议

开发阶段 RLS 全表开放，上线后建议：

1. `briefs` 表：公开可读，仅认证用户可写
2. `annotations` 表：仅认证用户可读写自己的数据
3. `tracks` / `track_items`：仅认证用户可管理

示例收紧策略（认证用户写入）：
```sql
create policy "briefs_write_auth" on public.briefs 
  for insert to authenticated with check (true);
```
