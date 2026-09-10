# 朝向自然

个人记录站点：读书、日记、学习、周记。用 [Astro](https://astro.build) 生成静态页面，内容用 Markdown 写在 `content/` 里，推送到 GitHub 后自动部署到 GitHub Pages。

## 在网页上写（推荐）

站点自带一个网页编辑器 [Sveltia CMS](https://sveltiacms.app)，地址是 **https://bluex888.github.io/admin/** 。它直接读写 GitHub 仓库里的 Markdown，不需要额外服务器，界面是中文。

首次登录（只做一次）：

1. 打开 https://bluex888.github.io/admin/ ，点 **使用访问令牌登录**
2. 弹窗里有个链接，点它会跳到 GitHub 生成令牌的页面（权限已经预选好），名字随便填，过期时间选 **No expiration**，点 **Generate token**
3. 把生成的那串令牌复制回弹窗，确定。以后打开这个网址就直接进后台，不用再登录

写文章：左侧是「日记 / 周记 / 学习 / 读书 / 页面」，点右上角 **+** 新建。正文上方有一排按钮：段落样式（标题、列表、引用、代码块）、**加粗**、*斜体*、删除线、代码、链接、图片；最右边可以切换到 Markdown 源码。图片会自动存到 `content/attachments/`。

保存与发布：**草稿**开关默认打开，此时点 **保存** 只是存到仓库，线上看不到；写完把开关关掉再点 **保存**，一两分钟后自动上线。

「发布时间」包含时分，按北京时间输入；网站也按北京时间显示，并按完整时间倒序排列。已有文章的网址不会因为补充时间而改变。两篇 `2026-09-10-1436`、`2026-09-10-1509` 读书笔记的时间按文件名补为 14:36、15:09。

安全说明：令牌只保存在你这台电脑的浏览器里；每次保存都是一次 GitHub 提交，可查、可回滚。要作废令牌，到 GitHub → Settings → Developer settings → Personal access tokens 删除即可。配置在 `public/admin/config.yml`。

旧的 [Pages CMS](https://app.pagescms.org) 也还能用（配置在 `.pages.yml`），两边改的是同一批文件。旧编辑器的发布时间使用文本输入，原样保留日期或带时区时间，避免日期控件丢失时分。

### 图片保存失败

若保存提示 Failed，不要把图片路径当成上传成功；先保留原图。刷新后只显示文件占位图时，点图片的「替换」重新选择原图，再保存。日记文字可能已保存，但图片文件未提交，重复保存一个失效路径不会补传图片。

若错误是 `Failed to fetch`，需查看浏览器控制台中的实际请求。本环境中已测到较大的 GitHub GraphQL 请求返回 HTTP 499 且缺少 CORS 响应头；这不等于令牌失效，也不能通过关闭浏览器安全检查解决。后台现在会在上传前把 JPEG、PNG、WebP 压缩为最长边不超过 2048 像素的 WebP，GIF 保持不变。已选中的旧图片须先保留原文件、更新后台后重新「替换」，才能应用压缩；仅点保存不会重新处理原图。

新增文件的 Base64 总量超过 4 MiB 时，会在发送请求前给出明确错误，保留草稿。多图可在媒体库分批上传，再插入正文。较小请求仍出现网络错误时，应继续排查到 GitHub API 的连接，不要反复刷新丢失现场。

后台固定使用 Sveltia CMS `0.209.0`，由 `scripts/prepare-cms.mjs` 下载、校验 SHA-256 并生成本地脚本。补丁让保存流程只修改正文副本，避免失败后重试时漏传图片；`pnpm dev`、`pnpm build` 自动准备脚本，首次运行需要联网。回归检查：`node --test tests/cms-save.test.mjs`。上游修复后应复测并移除补丁，不要直接恢复无版本号的 CDN 地址。

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
date: 2026-09-08T14:30:00+08:00     # 必填，包含时分和时区
updated: 2026-09-10T16:00:00+08:00  # 可选
description: 一句话摘要  # 可选，用于列表、RSS 和搜索引擎
slug: my-post          # 可选，自定义网址最后一段，不填用文件名
draft: true            # 可选，true 时本地能预览、线上不发布
---
```

`pnpm new` 和 Obsidian 模板也会保留时间。只有日期的旧记录仍兼容，但无法还原实际发布时分；需要精确排序时请补充。`slug` 留空或只填空白时使用文件名。

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
- `WALINE`：评论。游客不用登录就能匿名留言，服务端免费部署在 Vercel 上，步骤见下面「评论」一节
- `ANALYTICS`：访问统计，Umami 或 Cloudflare Web Analytics 任选，都留空则不加载统计脚本

## 评论

评论用 [Waline](https://waline.js.org/)，留言不需要登录，昵称、邮箱都可以不填。它需要一个自己的后端，免费部署到 Vercel 即可（一次性，约 10 分钟）：

1. 打开 https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fwalinejs%2Fwaline%2Ftree%2Fmain%2Fexample ，用 GitHub 登录，项目名随意（例如 `chaoran-comments`），点 **Create**。
2. 部署完成后进入项目，顶部 **Storage → Create Database**，选 **Neon**（Postgres），一路默认 **Continue** 建好。
3. 点进这个数据库 → **Open in Neon** → 左侧 **SQL Editor**，把 https://github.com/walinejs/waline/blob/main/assets/waline.pgsql 的内容粘进去，点 **Run** 建表。
4. 回到 Vercel 项目 → **Deployments** → 最新一条右侧 **⋯ → Redeploy**，让数据库配置生效。
5. 状态变成 Ready 后点 **Visit**，得到的网址（形如 `https://chaoran-comments.vercel.app`）就是评论服务地址，填到 `src/site.config.ts` 的 `WALINE.serverURL`，推送后评论区就出现了。
6. 打开 `<评论服务地址>/ui/register` 注册，**第一个注册的账号自动成为管理员**，之后在 `<评论服务地址>/ui` 里删评论、标记垃圾。

可选设置（Vercel 项目 → Settings → Environment Variables，改完要 Redeploy）：

- `COMMENT_AUDIT=true`：所有留言先审核再显示
- `SMTP_SERVICE` / `SMTP_USER` / `SMTP_PASS`：配好后有新留言会发邮件通知你（例如 `SMTP_SERVICE=QQ`，密码用邮箱的 SMTP 授权码）
- `SECURE_DOMAINS=bluex888.github.io`：只允许本站调用评论服务

注意：`vercel.app` 域名在国内部分网络下打不开，若国内访客看不到评论区，在 Vercel 的 Settings → Domains 绑一个自己的域名即可。

## 浏览量

填好 `src/site.config.ts` 中的 `WALINE.serverURL` 后，两处计数会一起启用：

- 文章标题下显示当前文章的阅读次数。
- 所有页面（包括首页）的页脚显示全站总浏览次数，访问首页、栏目、文章等公开页面都会累计；独立的 `/admin/` 编辑器不计入。

两者共用上面的 Waline 服务和数据库，不需要另建统计服务。也可以在构建时设置环境变量 `PUBLIC_WALINE_SERVER_URL`，无需修改配置文件。

统计的是浏览次数（PV），不是去重人数；刷新页面会再次计数。全站总量从启用这项功能时开始累计，不会补算过去的访问。开发模式和非 `SITE.url` 同源的预览只读取计数，不写入线上数据。服务未配置时隐藏计数，服务不可用时显示 `--`。

计数逻辑测试：`node --experimental-strip-types --test tests/pageviews.test.mjs`。

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
