# 朝然的博客

个人记录站点：读书、日记、学习、周记。用 [Astro](https://astro.build) 生成静态页面，内容用 Markdown 写在 `content/` 里，推送到 GitHub 后自动部署到 GitHub Pages。

## 在网页上写（推荐）

站点接入了 [Pages CMS](https://pagescms.org)，一个开源的网页编辑器，直接读写 GitHub 仓库里的 Markdown，不需要额外服务器。

1. 打开 https://app.pagescms.org ，用 GitHub 账号登录（沿用 GitHub 的两步验证）
2. 首次使用会要求安装 Pages CMS 的 GitHub App，选择 **Only select repositories**，只勾 `BlueX888.github.io`
3. 进入仓库后左侧就是「读书 / 学习 / 日记 / 周记 / 关于页」，点 **Add entry** 新建，写完点 **Save**

保存即提交到仓库，一两分钟后自动上线。编辑器有工具栏（标题、粗体、引用、代码、链接、表格），支持拖拽或粘贴图片（自动存到 `content/attachments/`），勾选「草稿」可以先存着不发布。

安全说明：Pages CMS 只能访问你勾选的这一个仓库；写入的每一次提交都在 GitHub 提交记录里可查、可回滚。要撤销授权，到 GitHub → Settings → Applications → Installed GitHub Apps 卸载即可。配置在仓库根目录的 `.pages.yml`。

## 用 Obsidian 写（可选）

`content/` 文件夹也是一个 Obsidian 库：在 Obsidian 里「打开文件夹作为仓库」选中 `content/` 即可。配置已写好：链接用标准 Markdown 相对路径，图片自动存到 `content/attachments/`。

```
content/
├── reading/      读书      -> /reading/文件名/
├── diary/        日记      -> /diary/文件名/
├── learning/     学习      -> /learning/文件名/
├── weekly/       周记      -> /weekly/文件名/
├── attachments/  图片附件
├── pages/about.md  关于页
└── _templates/   Obsidian 模板（不会被发布）
```

新建文章可以在 Obsidian 里直接建文件，也可以用命令：

```bash
pnpm new reading 一本书的名字
pnpm new learning 学习主题
pnpm new diary          # 今天的日记 content/diary/2026-09-08.md
pnpm new weekly         # 本周周记 content/weekly/2026-W37.md
```

文章头部（frontmatter）字段：

```yaml
---
title: 标题            # 日记可以不写，会显示成「2026年9月8日」
date: 2026-09-08       # 必填
updated: 2026-09-10    # 可选
description: 一句话摘要  # 可选，用于列表、RSS 和搜索引擎
slug: my-post          # 可选，自定义网址最后一段，不填用文件名
draft: true            # 可选，true 时本地能预览、线上不发布
---
```

写好后发布：

```bash
git add -A && git commit -m "新文章" && git push
```

一两分钟后 GitHub Actions 会构建并更新站点。

### 支持的写法

- 双链 `[[别的笔记]]`、`[[reading/某本书|显示文字]]`，以及 Obsidian 生成的相对链接 `[x](../reading/某本书.md)`，都会变成站内网址
- 图片 `![[图.png]]`、`![](../attachments/图.png)` 或网页编辑器写入的 `/attachments/图.png`，构建时都会自动压缩优化
- 代码块自动高亮，深浅色跟随主题
- 公式：行内 `$E=mc^2$`，块级 `$$ ... $$`
- 脚注、表格、任务列表、删除线

## 本地预览

```bash
pnpm install
pnpm dev        # http://localhost:4321，改文件即时刷新（搜索页在 dev 下不可用）
pnpm build      # 生成 dist/ 并建搜索索引
pnpm preview    # 预览 dist/，搜索可用
pnpm check      # 类型检查
```

## 配置

只需要改 `src/site.config.ts`：

- `SITE`：站名、简介、线上地址
- `SECTIONS`：栏目名称与说明（要新增栏目，还需在 `src/content.config.ts` 加一行并建对应文件夹）
- `GISCUS`：评论。到 https://giscus.app 按提示选择本仓库，把生成的 `repo` / `repoId` / `category` / `categoryId` 填进来。前提：仓库已开启 Discussions，并安装了 giscus GitHub App
- `ANALYTICS`：访问统计，Umami 或 Cloudflare Web Analytics 任选，都留空则不加载统计脚本

## 部署

`.github/workflows/deploy.yml` 会在推送到 `main` 时构建并发布。首次需要在仓库 Settings → Pages 里把 Source 设为 **GitHub Actions**。

## 目录结构

```
src/
├── site.config.ts      全站配置
├── content.config.ts   内容集合与 frontmatter 校验
├── layouts/Base.astro  页面骨架、<head>、主题脚本
├── components/         头部、底部、文章列表、评论、统计
├── pages/              路由：首页、栏目、文章、归档、标签、关于、搜索、RSS、404
├── plugins/            Markdown 插件：Obsidian 链接改写、KaTeX 公式
├── lib/                取文章、排序、摘要、字数等工具函数
└── styles/global.css   全部样式
scripts/new.mjs         新建文章脚本
```
