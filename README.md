---
title: "阿鹏资讯站 README"
summary: "阿鹏资讯站是Peng老师的个人策展平台。AI每日自动抓取金融科技等领域资讯，整理为四个时段简报推送到网站。前端纯HTML/CSS/JS，Supabase数据库，支持Markdown渲染、划词标注、收藏追踪、多引擎深度搜索，部署于Vercel。"
---

# 阿鹏资讯站

个人策展平台 — AI 每日抓取信息推送到网站，用户可浏览、划词标注、归档收藏。

## 功能

- **每日简报**：早间/午间/晚间/夜间四个时段，Markdown 渲染
- **新闻条目卡片**：自动解析 `##` 标题为独立卡片，每卡片带 ⭐收藏 / 🔥重要 / 🔍搜索 按钮
- **划词标注**：选中任意文字弹出浮动菜单，支持收藏、标记重要、深度搜索、加备注
- **深度搜索**：选中文字后一键搜索百度、Google、B站、微信
- **我的收藏**：按类型/标签筛选，支持搜索
- **追踪线索**：建立追踪线索，同标签内容自动串联时间线
- **移动端适配**：底部 Tab 导航，侧边栏收起
- **微信兼容**：内置浏览器不用 `window.open`，改用剪贴板复制链接

## 技术栈

| 层 | 技术 |
|---|---|
| 前端 | 纯 HTML / CSS / JS（无框架，无构建步骤） |
| 数据库 | Supabase（PostgreSQL） |
| Markdown 渲染 | marked.js（CDN） |
| 部署 | Vercel → GitHub 仓库 `leonpeng8-dot/APeng-news` |

## 文件结构

```
APeng-news/
├── index.html          # 主页面（资讯阅读 + 划词标注）
├── styles/
│   └── main.css        # 深色主题样式
├── js/
│   ├── app.js          # 主逻辑（加载、渲染、导航、搜索）
│   ├── supabase.js     # 数据库操作层（CRUD）
│   └── annotation.js   # 划词标注模块
├── admin/
│   └── index.html      # 管理写入页面（?admin=1 跳转）
├── sql/
│   └── schema.sql      # 建表 SQL + RLS 策略
├── README.md           # 本文件
└── supabase_setup.md   # Supabase 建表 + Vercel 部署指南
```

## 快速开始

1. **建表**：将 `sql/schema.sql` 内容复制到 Supabase SQL Editor 执行
2. **部署**：连接 GitHub 仓库到 Vercel，自动部署（详见 [supabase_setup.md](./supabase_setup.md)）
3. **写入第一条简报**：访问 `https://你的域名/admin/`，粘贴 Markdown 内容写入
4. **浏览**：访问 `https://你的域名/` 查看简报，选中文字体验划词标注

## 管理入口

- 管理页面：`/admin/` 或首页 `?admin=1`
- 管理页面功能：选择日期/时段 → 粘贴 Markdown → 预览解析 → 写入数据库
- Markdown 格式：用 `## 标题` 分隔每条新闻，系统自动解析为条目卡片

## 数据库表结构

| 表名 | 用途 |
|---|---|
| `briefs` | 简报/文章（日期、时段、标题、内容、解析条目、标签） |
| `annotations` | 划词标注（选中文字、类型、备注，关联简报） |
| `tracks` | 追踪线索 |
| `track_items` | 追踪条目关联（标注 ↔ 线索 ↔ 简报） |

## Supabase 配置

- Project URL: `https://vxlylfiyvorfcgxbympt.supabase.co`
- Publishable Key: 前端代码内（公开 key，非 secret key）
- RLS 策略：开发阶段全表公开可读写，生产环境需收紧

## 浏览体验

| 操作 | 桌面端 | 移动端 |
|---|---|---|
| 导航 | 左侧边栏 | 底部 Tab + ☰ 菜单 |
| 划词标注 | 鼠标选中 → mouseup 弹菜单 | 长按选中 → touchend 弹菜单 |
| 深度搜索 | 选中文字 → 🔎 → 选引擎 | 同桌面端 |
| 收藏 | 选中文字 → ⭐ 或卡片右上角⭐ | 同桌面端 |

## License

MIT
