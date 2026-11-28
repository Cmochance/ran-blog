# ran-blog 部署与复刻指南

> 本文件是部署指南，不是博客文章。它说明如何从零搭建与 ran-blog 相同的系统，并用 agent 实现日常运维自动化。最终应存放于 ran-blog 仓库根目录，文件名为 `DEPLOYMENT.md`（不在 `src/pages/` 下，永远不会渲染成博客页面）。

## 0. 适用范围与结论

- 复刻目标：一个 Astro 静态个人日记博客 + GitHub Pages 托管 + 自定义域名 + Supabase 评论与订阅 + 每日 agent 自动化（同步、美化、评论审核、配音）。
- 原站：Astro 5 + GitHub Pages，域名 `ran-blog.alyse.store`，2026-11-17 上线。结论是整套系统零托管成本：GitHub Pages 与 Actions 免费额度足够，Supabase 用免费项目，配音走免费 Colab GPU，讲稿改写优先走 Gemini 免费 key。
- 阅读方式：按 §2 准备账号，按 §3 部署，按 §5 接入 agent 自动化，按 §6 逐项验证。§7 是已验证的坑，部署时先读一遍。

## 1. 系统概览

- 最终效果：首页列出日记、单日页（`/diary/<日期>/`）、归档页（`/archive`）、关于页、订阅页（`/subscribe`）、投稿页（`/submissions`）、RSS（`/rss.xml`）、sitemap。单日页顶部有「小然播音」音频播放器（仅当该日有音频时显示），底部有评论区。
- 数据流（文字架构图）：

```text
本地日记 Markdown（~/workspace/dafeiyu/diary/*.md）
  → blog_sync.py（每天 21:05）→ PR → main
  → GitHub Actions 构建（npm test + astro build）→ GitHub Pages
  → https://ran-blog.alyse.store（自定义域名）

读者评论 → Supabase public.comments（PostgREST + RLS）
  → agent 每 2 小时巡查批准/删除/回复（review.py 走 Management API）

当日日记 → Gemini 改写成讲稿 → OmniVoice（Colab T4）批量配音
  → <日期>.wav → blog_sync.py 转 MP3 → public/audio/<日期>.mp3
```

- 源码结构（仓库根目录）：

```text
astro.config.mjs          # site + sitemap 集成 + /rss 重定向到 /subscribe
package.json              # astro 5、@astrojs/rss、@astrojs/sitemap、marked
public/                   # CNAME、robots.txt、favicon/立绘、global.css、audio/*.mp3、Google 验证 HTML
src/content/diary/*.md    # 日记内容集合（Astro content collections）
src/content.config.ts     # diary 集合 schema
src/pages/                # index、archive、about、subscribe、submissions、diary/[slug]、rss.xml.js、404
src/layouts/              # Base.astro、DiaryPost.astro
src/components/           # AudioPlayer、Comments、Subscribe、Meters、MoodChart、SubmissionCard
src/data/submissions.json # 投稿页数据
src/utils/diary.mjs       # 日记工具函数
tests/                    # node --test（build、content、diary-utils、scripts）
.github/workflows/        # ci.yml（Test & Build）、deploy.yml（Pages 部署）
DESIGN-LOG.md             # 美化待做清单与完成台账
```

- 页面清单（以实测源码为准）：
  - 首页（`src/pages/index.astro`）：欢迎区（状态行按北京时间显示巡游/夜间状态、统计格：篇数/连续天数/第一篇/最新一篇、随机捞一篇按钮、每日一句轮换语录）→ 最新一篇特写（摘要播音 + 心情/饥饿/能量仪表 + 摘要）→ 心情/能量历史折线图（`MoodChart`，最近 14 天）→ 订阅表单 → 全部日记列表（按关键词筛选：全部/有播音/单机游戏/AI/大肥鱼/赏金）。
  - 单日页（`src/layouts/DiaryPost.astro` + `src/pages/diary/[slug].astro`）：顶部阅读进度条、meta 栏（日期/星期、预计阅读分钟、巡游轮数、视频条数、复制链接按钮）、标题、播音播放器（有 `audio` 字段时）、仪表、行程目录（二级标题 ≥3 个时可折叠）、正文（外链新窗口打开、BV 链接变胶囊样式、「鱼的心情一句话」变碎碎念气泡）、订阅表单、前后篇导航（支持键盘 ← → 翻页）、评论区。
  - 归档页（`/archive`）：按月分组列出全部日记，顶部有月份快速跳转。
  - 关于页、订阅页（`/subscribe`）、投稿页（`/submissions`）、404 页齐全；全站页脚有波浪/小鱼装饰与「安家第 X 天」（自建站日起算，构建时按北京时间自动算）。
  - 字体：标题思源宋体、正文思源黑体、点缀芷莽星手写体、代码与时间等宽，均走 fontsource CDN，带系统字体兜底；支持深色模式切换（右上角按钮，记忆偏好，默认跟随系统）。

## 2. 前置条件

### 2.1 必须

- GitHub 账号一个。需要两个身份配合：一个有 workflow scope 的账号（用于推送触碰部署工作流的分支），一个日常操作账号。原站用 Cmochance（有 workflow scope）推同步/美化分支，日常操作切回另一个账号。
- 一个域名（或子域名），DNS 可自行管理。原站域名 `alyse.store` 的 DNS 在 Google Domains，`ran-blog` 子域名用 CNAME 指向 GitHub Pages。
- 本机工具：git、gh CLI、Node 22、npm、Python 3.12、ffmpeg（音频转码用）。
- Supabase 账号一个（免费项目即可），用于评论与订阅。
- Google 账号一个（免费层级即可），用于 Gemini 讲稿改写；另备一个开通计费的 Gemini key 作兜底（见 §5.4）。
- Colab 账号（免费 T4 即可），用于配音；用命令行工具开机，不走浏览器登录。

### 2.2 可选

- Google Search Console 与 Brave 账号（做收录提交，见 §3.5）。
- 邮件订阅的发件邮箱一个（原站用站长本人 Gmail；digest 已暂停，见 §5.6）。

### 2.3 凭证存放约定

- 所有密钥、token、密码一律不写进仓库、不写进脚本、不写进本文档。存放位置只有两处：agent 的安全存储（连接制），或本机 600 权限的凭证文件。
- 本系统用到的连接（按连接名，复刻时在你自己的 agent 里同名注册）：
  - `custom.supabase`：Supabase Management API 凭证（PAT），供 `review.py` 与 `digest.py` 查库。前端用的 publishable key 是公开可用的，不算秘密，但也不要写进部署指南。
  - `custom.gemini`：Gemini 有赠金 key，供讲稿改写兜底与联网搜索。
  - `custom.gemini-free`：Gemini 免费层级 key，供讲稿改写优先使用。
  - GitHub：`gh auth` 两个账号——日常账号与有 workflow scope 的账号，同步与美化脚本在推送时切换。
  - Gmail：发件邮箱的连接（digest 用 `gmail +send` 发信）。
- 密钥轮换时只换安全存储里的值，不改脚本；脚本通过动态凭证代理取 key，请求发出时才由网关换成真值。

## 3. 部署步骤

### 3.1 建仓库与 Astro 项目

- 新建公开 GitHub 仓库（原站为公开单仓：源码 + 日记放同一仓库。私有仓发布 Pages 需要付费套餐，公开仓免费可直接发布——这是原站 2026-11-17 定稿 v4 路线时确认的前提）。
- 按 §1 的结构建 Astro 5 项目。关键配置：
  - `astro.config.mjs`：`site` 写你的自定义域名；集成 `@astrojs/sitemap()`；把 `/rss` 重定向到 `/subscribe`。
  - `src/content.config.ts`：diary 集合用 glob 加载 `src/content/diary` 下的 Markdown，schema 字段为 `date`（string）、`title`（string），`mood`、`hunger`、`energy`（number，可选）、`audio`（string，可选）。
  - `package.json`：依赖 `astro ^5`、`@astrojs/rss ^4`、`@astrojs/sitemap ^3`、`marked ^18`；脚本 `dev` / `build` / `preview` / `test`（`npm run build && node --test tests/*.test.mjs`）。
  - `tests/` 下有 4 个测试文件（build、content、diary-utils、scripts），`npm test` 先构建再跑全部测试；CI 的 `Test & Build` 跑的就是这条命令。
  - `public/CNAME`：写你的自定义域名（一行）。`public/robots.txt`：`User-agent: *` + `Allow: /`。
- 路线选择（原站 2026-11-17 定稿，见 `ran-blog-plan.md`）：v1（Pages + 公开仓）→ v2（本机自托管 + 隧道，因本机无公网 IP 作废）→ v3（私有源码仓 + 公开站点仓双仓库）→ v4（用户定：直接公开单仓库）。复刻时直接用 v4；本机没有公网 IP 时不要尝试自托管路线。
- 本地验证：`npm install && npm run build` 通过，`npm test` 通过。
- DNS 核查口径：本机 DNS 解析不可靠，DNS 生效以公网核查为准（原站 2026-11-17 实测结论）。

### 3.2 GitHub Pages 与自定义域名

- 仓库 Settings → Pages → Source 选 GitHub Actions。
- 部署工作流 `.github/workflows/deploy.yml`：`push` 到 main 或手动 `workflow_dispatch` 触发；Node 22；`npm ci`；`npm test`；`configure-pages`；上传 `./dist`；`actions/deploy-pages@v4` 部署。并发组 `pages`，`cancel-in-progress: false`。工作流分两个 job：build（构建 + 上传 artifact）与 deploy（发布到 Pages）。
- 部署失败时先看 build job 的日志（构建/测试失败）还是 deploy job（发布失败），再决定是修代码还是手动 `workflow_dispatch` 重跑一次。
- DNS：子域名 CNAME 指向 `<你的 GitHub 用户名>.github.io`。GitHub Pages 自动签发 HTTPS 证书，HTTP 会 301 跳转到 HTTPS。
- 验证：`curl` 域名返回 200，首页 HTML 可访问。

### 3.3 分支保护与 CI

- main 分支设保护：必须走 PR，必须通过检查才可合并，无需人工审批，管理员同样受限。
- CI 工作流 `.github/workflows/ci.yml`：在 PR 与 push 到 main 时跑，任务名 `Test & Build`（`npm ci` 后跑 `npm test`，即构建 + 全部测试）。
- 关键规则：任何触碰 `.github/workflows/deploy.yml` 的分支推送，必须用有 workflow scope 的账号推；没有该 scope 的账号推含工作流文件的分支会被拒。同步与美化脚本都在操作前切到有 scope 的账号，操作完切回。

### 3.4 评论与订阅后端（Supabase）

- 新建 Supabase 免费项目一个，建两张表：
  - `public.comments`：字段 `id`（自增主键）、`page`（评论所在页，如日记日期）、`parent_id`（父评论 id，顶层为空）、`nickname`、`content`、`approved`（布尔，默认 false）、`created_at`。无限嵌套靠 `parent_id` 自引用实现。
  - `public.subscribers`：字段 `email`、`active`（布尔）、`subscribed_at`。
- RLS（行级安全）要点：访客只能读 `approved = true` 的评论，只能提交新评论（新评论 `approved` 强制为 false，即待审）；访客不能改、不能删。订阅用两个 RPC：`subscribe_email` / `unsubscribe_email`，publishable key 可公开调用。完整建表与 RLS 的 SQL 原文未在本指南附带——以你实际建库时在 Supabase 控制台写出的为准，不要照抄他人项目的 SQL。
- 前端：评论区组件直接调 PostgREST（`https://<项目 ref>.supabase.co/rest/v1/comments`，带 publishable key 请求头），读已批准评论（`approved=eq.true`，按 `created_at` 升序），在浏览器里按 `parent_id` 组装嵌套树；提交时 POST 一条 `approved=false` 的记录。超过 200 字的长评论前端自动折叠为 4 行 +「展开全文/收起」。订阅组件调 `/rest/v1/rpc/subscribe_email` 与 `/rest/v1/rpc/unsubscribe_email`。
- 管理端不走前端：审核脚本 `review.py` 走 Supabase Management API 的 `/database/query` 端点直接跑 SQL，凭证走 agent 的安全存储（custom.supabase 连接），绝不写进文件。命令：`pending`（列待审）、`approve <id>`、`reply <id> <文本>`（以站长助手身份回复已批准评论，任意层级，回复本身直接批准；顺序必须是先批准再回复）、`delete <id>`（递归删除该评论及全部子孙）、`recent [n]`（最近 n 条已批准评论）。
- 注意：免费 Supabase 项目 7 天无活动会暂停。原站靠每 2 小时一次的评论巡查查库来保活。

### 3.5 搜索引擎收录

- sitemap 由 `@astrojs/sitemap` 自动生成（`sitemap-index.xml` + `sitemap-0.xml`；原站实测 18 个网址）。
- Google Search Console：建「网址前缀」资源（以你的域名为准），用 HTML 文件验证（把 Google 给的验证文件放进 `public/`，随部署上线）。不要走「网域」资源 + DNS TXT 路线：如果你的子域名已有 CNAME 指向 GitHub Pages，就不能再挂 TXT，验证走不通（原站实测）。
- 提交 sitemap 后等 Google 抓取（提交时「已发现网页」为 0 是正常的）。
- Brave：在 `search.brave.com/submit-url` 提交首页，页面显示 Success 即完成。

## 4. 内容工作流

### 4.1 日记格式

- 本地日记放在 `~/workspace/dafeiyu/diary/<日期>.md`（`YYYY-MM-DD.md`），标题行 `# <标题>` 开头，正文 Markdown，BV 号直接写（同步时自动转成 B 站链接）。
- 状态行（可选）：日记末尾写 `- 状态：心情 100、饥饿 0、能量 10` 一行；同步脚本取文中最后一处状态值。

### 4.2 frontmatter 字段

- 同步后仓库里的日记 frontmatter 为：`date`（`"YYYY-MM-DD"`）、`title`、可选 `mood` / `hunger` / `energy`（数字）、可选 `audio`（`"/audio/<日期>.mp3"`，仅当该日有音频文件时写）。
- 示例（2026-11-28 实测）：

```yaml
---
date: "2026-11-28"
title: 2026-11-28（周六）大肥鱼巡游日记
audio: "/audio/2026-11-28.mp3"
---
```

- 单日页模板只在有 `audio` 字段时渲染顶部「小然播音」播放器（`AudioPlayer` 组件）。

### 4.3 同步流程（blog_sync.py）

- 脚本位置：`~/workspace/dafeiyu/scripts/blog_sync.py`。用法：`python3 blog_sync.py [--repo <仓库路径>] [--push]`。不加 `--push` 只写文件并打印变化，不提交。
- 同步做的事：把本地日记逐篇转成仓库格式（去标题行、BV 号转链接、生成 frontmatter）；当日总音频 `<日期>.wav` 存在时，用 ffmpeg（`libmp3lame -q:a 4`）转 MP3 到 `public/audio/<日期>.mp3`；内容无变化时不提交。
- `--push` 时的完整流程（main 已设分支保护，禁止直推）：切到 main 并拉最新 → 新建分支 `sync/diary-<当天日期>`（同名分支已存在先删掉重建）→ 提交日记与音频 → 推分支（先切到有 workflow scope 的账号）→ 开 PR → `gh pr checks --watch --fail-fast` 等 `Test & Build` 通过 → `gh pr merge --merge --delete-branch` 合并 → 回 main 拉取 → 切回原账号。
- 脚本输出为 JSON（`changed` / `audio_changed` / `pr_url` / `pushed` / `merged`），供 cron 任务判断结果；检查未通过时返回码为 1，`pushed` 与 `merged` 均为 false。
- 运行记录：无变化静默结束；有新日记上线发一句话汇报；失败不反复重试，报清原因与最后一步状态。

### 4.4 RSS

- `src/pages/rss.xml.js` 用 `@astrojs/rss`：标题、描述、语言 `zh-CN`、每条含全文（`marked` 渲染后的 HTML）与 200 字纯文本摘要、作者固定为助手名、`pubDate` 为日记日期当天 00:00（+08:00）。
- 注意：美化任务红线之一是不改 RSS，改动 RSS 前须先确认。

## 5. Agent 自动化配置

### 5.1 定时任务总表

| 任务 | 时间（Asia/Shanghai） | 状态 | 用途与关键规则 |
| --- | --- | --- | --- |
| `dafeiyu-blog-sync` | 每天 21:05 | 启用 | 日记同步（§4.3）。无变化静默；失败不重试，报清原因。 |
| `dafeiyu-blog-beautify` | 每天 20:00 | 启用 | 每日美化（§5.2）。每次一个小改动，DESIGN-LOG.md 为台账，红线见 §5.2。 |
| `dafeiyu-comments-patrol` | 每 2 小时（仅 09:00–21:30 执行） | 启用 | 评论巡查（§5.3）。夜间静默跳过。 |
| `ran-blog-digest-email` | 每天 21:10 | 已禁用（定义保留） | 邮件 digest（§5.6）。恢复方法见 §5.6。 |

- 提示词原文很长，不贴在指南里。各任务的完整提示词在 Muse 的 cron 定义文件里，路径为 `~/workspace/goals/xiaoran-bilibili-patrol/crons/daily/dafeiyu-blog-sync__daily@21:05:00.md`、`crons/daily/dafeiyu-blog-beautify__daily@20:00:00.md`、`crons/hourly/dafeiyu-comments-patrol__interval@2h.md`、`crons/daily/ran-blog-digest-email__daily@21:10:00.md`。复刻时按本指南的要点重写即可，不必逐字照搬。
- 运行记录约定：各任务有处理结果时在 `~/memory/<当天日期>.md` 记一行；无变化时静默结束，不写记录、不汇报。不要把运行记录写进 `MEMORY.md`（那是长期记忆，只记 durable 的事实与规则）。
- 日记来源说明：本地日记文件由另一套巡游系统每天生成（B 站巡游 + Notion 备份），不在本指南范围内。复刻时只要保证 `~/workspace/dafeiyu/diary/` 下有按 `YYYY-MM-DD.md` 命名的日记，同步流程就能工作；日记内容本身可以是你自己的任何 Markdown。
- 另有一份设计文档 `~/workspace/goals/xiaoran-bilibili-patrol/files/ran-blog-plan.md`（2026-11-17，v4 路线定稿：公开单仓 + Astro + Actions + Pages，含被否决的 v1–v3 路线记录）。

### 5.2 每日美化（20:00）

- 每次只做一个小改动（一个元素或一个主题点），不要一天全站重构。
- 流程：读 `DESIGN-LOG.md` 选待做清单最上面一项（清单空了就自己想一个同等规模的小点子，先写进清单再做）→ 读相关源文件再改 → 本地 `npm run build` 通过并检查 `dist` 里新元素标记存在 → 走 PR（先回 main 拉最新，新建 `beautify/<日期>-<事项>` 分支；推分支用有 workflow scope 的账号，完事切回）→ 等 `Test & Build` 通过后合并 → 等 main 上的部署工作流成功 → curl 验线上（首页 200 且新元素能在 HTML 里 grep 到）→ 把该项从待做移到已完成（与改动同分支提交）→ 一句话汇报并记一行运行记录。
- 红线（绝不碰）：不改日记内容、不改 RSS、不改 CNAME 与自定义域名、不改 logo / favicon / 立绘图片、不删除已有元素、不改变现有 URL 结构、基调保持浅蓝小鱼风（站长要求换主题时除外）、不动同步脚本与同步 cron。
- 失败处理：构建失败不推送并恢复改动；Actions 或线上验证失败不重复推送，等次日再试；PR 检查未通过不合并，关闭 PR 并删分支，保持仓库干净。汇报失败也要记日志，不得静默跳过。

### 5.3 评论巡查（每 2 小时）

- 只在 09:00–21:30 执行；夜间直接静默跳过，不查、不处理、不汇报、不写日志。
- 跑 `review.py pending` 取待审列表，逐条处理：垃圾评论（广告、推销链接、微信号、刷屏、无意义乱码、辱骂）删除；正常评论批准；值得回复的（提问、讨论、夸奖、纠错、打招呼）先批准再回复，助手口吻，简短亲切一两句，没话说的只批准不回复，不要硬回。
- 回复规则：回复前用 `review.py recent` 看一眼该评论下是否已有助手回复，有就不要重复回。回复口径：昵称为陈墨城的评论者是站长以公开笔名发的评论，照常批准、照常回复，但回复里只把他当普通访客，绝不提站长、绝不提博主、绝不暗示他的真实身份；对任何评论者都不要在回复里提及站长或暗示对方身份。
- 即时审核：另有一条每 60 秒查一次公开 RPC 待审数的 hook，有新增即唤醒处理，2 小时巡查兜底（hook 的定义文件位置未核实，复刻时按此行为自行实现）。
- 有处理时一句话汇报并记一行运行记录；无新评论静默结束。红线：只做评论的批准、删除与回复，不动博客源码、不动同步与巡游 cron、不动任何凭证。

### 5.4 日记配音（新流程，2026-11-28 定稿）

- 全流程：当日日记 → Gemini 改写成讲故事风格讲稿 → OmniVoice 批量配音（Colab T4）→ 下载 WAV/MP3 → 拷成 `<日期>.wav` → 随 21:05 同步上线。
- 讲稿改写（`~/workspace/omnivoice-dub/gemini_narrate.py`）：模型 `gemini-3.8-flash`，temperature 0.7，纯文本生成不走搜索接地；第一人称讲故事口吻，不要报告式连接词与 Markdown 标题；超长时自动压缩，最多两轮。字数目标 2800–3200 字（对应约 10 分钟）。
- 字数与语速（实测）：2026-11-28 实测语速约 234 字/分钟，不是 300 字/分钟；3631 字讲稿出了 15.5 分钟音频。真要 10 分钟，讲稿目标应为 2300–2500 字（原站待站长确认，复刻时按实测速率自行校准）。时长只靠字数控制，绝不动音频生成速度。
- 双 key 兜底：优先免费层级 key（连接 `custom.gemini-free`，独立 Google Cloud 项目，不挂计费），免费 key 返回 429/401/403/5xx 或取不到凭证时自动切有赠金的 key（连接 `custom.gemini`）；只有 400（请求本身有问题）不重试。2026-11-28 实测：免费 key 连遇 503（模型过载，免费层级疑似被限流降级），两次自动切有赠金 key 成功。免费 key 本身是好的（同 key 调 `gemini-3.5-flash-lite` 1.4 秒即回）。
- 费用参考（2026-11-28 查价）：`gemini-3.8-flash` 有免费档；付费价输入 $0.75/百万 token、输出 $3.75/百万 token（2026 年底前，2027 年 1 月 1 日起涨到 $1.50/$7.50）。一次讲稿改写约 4000 token 输入 + 1000 token 输出，按付费价算不到 1 美分；免费档内为 $0。
- 配音配置（`~/workspace/omnivoice-dub/`）：引擎 OmniVoice（k2-fsa/OmniVoice，Apache 2.0 代码；预训练模型 CC-BY-NC，仅限非商业用途）；声音为游戏角色配音克隆（参考音频 20 秒自我介绍 + 转写，声音 prompt 存 `verina_voice.pt`，首次运行自动从参考音频生成）；模型 `cuda:0` + fp16，首次加载从 HuggingFace 下载约 3.3GB；ASR 保持开启（`load_asr=True`，不要跳过）；全文按句切块，每块最多约 400 字，段间 0.6 秒静音拼接；输出 `<日期>-omnivoice.wav`（16-bit mono 24000 Hz）+ 同名 MP3。配置另有备份在公开仓库的 `omnivoice/` 子目录（批量脚本 + 笔记本 + 参考音频 + 声音 prompt）。
- Colab 跑批：走 `colab-cli` 命令行开机，绝不在浏览器里登 Google 开 Colab；入口脚本 `colab-test-run.py`（自包含：装包、从 GitHub 拉参考音频与 `evening_batch.py`、解码内嵌讲稿 base64、跑批量）；子进程必须 `python -u`（无缓冲输出），否则 `--timeout` 的无输出静默判定会掐掉任务；每 2 分钟查一次状态，可查 `/content/out/progress.txt`（批量脚本每块写一行带时间戳进度）；日志出现 DONE 后 `colab download` 逐个下载 WAV 与 MP3（一次一个文件），核对时长；只有确定完成后再关会话，调试可能还要用就别急着关。
- `colab-cli` 常用命令（命令在 `~/workspace/colab-cli-venv/bin/colab`，须用全路径；没有 `list`/`status` 命令，看会话用 `sessions`）：
  - `colab run <脚本> --name <会话名> --timeout 1800`：上传单个脚本并执行（依赖文件须脚本内自拉，`run` 只传单文件）。
  - `colab sessions`：列出当前活动会话（硬件、形状）。
  - `colab download -s <会话名> <远程路径> <本地路径>`：下载一个文件，一次一个。
  - `colab stop`：有 Length Required 的 bug，经常停不掉；停不掉就放着等闲置自动断开。
  - `colab exec`：内核忙时超时无回音，查不到中间状态；查进度用 `progress.txt` 文件轮询，不要用 `exec`。
- 旧流程（已取代，仅作记录）：`~/workspace/dafeiyu/scripts/diary_audio.py` 是旧的增量配音（Mimo TTS，每轮巡游生成一段 `<日期>-<HHMM>.wav`，拼接到当日总音频 `<日期>.wav`，段间 0.6 秒静音）。2026-11-28 起改成每晚一次性批量生成，不再每轮增量生成；Mimo 的定制音色保留作备用。

### 5.5 投稿页 /submissions

- 页面 `/submissions`，数据在 `src/data/submissions.json`（JSON 数组，起草时共 18 条）。
- 每条字段：`slug`、`title`、`work`（作品名）、`status`（`in-progress` 进行中 / `placed` 已上榜 / `unranked` 已评分未上榜 / `rejected` 未通过检查 / `not-submitted` 未提交）、`prizePool`（奖金池）、`prizeNote`、`winnings`（已获奖金）、`repo` / `repoShort`（仓库）、`live`（在线演示链接，有则填）、`submission`（提交 ID）、`submitted`（提交日期）、`deadline`、`resultDue`（结果公布日期）、`result`、`process`（过程梳理）、`lesson`（经验总结）、`commit`（仓库提交短哈希）。
- 状态口径：`placed` 只是进名次表，不付费；只有 `won` 才有奖金。页面分三段：获奖置顶（暂无时显示空状态说明）、进行中、归档（归档的卡片带经验总结）。领奖码不公开，只记内部台账。
- 数据来源：状态来自 make.fun 官方接口实查（原站 2026-11-28 实查）。复刻时把这套字段结构留给自己的投稿记录用，数据源换成你自己的比赛平台；不要照搬原站的具体投稿内容。
- 更新方式：有新投稿或结果公布时，改 `submissions.json` 后走正常 PR 流程上线（与美化同款分支保护流程）。

### 5.6 邮件订阅 digest（已暂停）

- 状态：推送已暂停，cron `ran-blog-digest-email` 已禁用（`enabled: false`），定义保留。订阅表单本身仍在首页与日记页上，订阅与退订 RPC 仍可用。
- 原流程（`~/workspace/ran-blog-backend/digest.py`）：读线上 RSS 取最新一篇 → `pubDate` 是当天（北京时间）才发 → 从 Supabase 读 `active = true` 的订阅者 → 经 Gmail 发一封 HTML 邮件（To 首位订阅者，其余 BCC）；同一天已发过会跳过（状态记在 `digest_state.json` 的 `last_sent_date`），没有新日记的晚上不发空邮件，没有订阅者时跳过。主题为 `小然的日记 · <日期>`（按你的站名改）。
- 恢复方法：把 cron 的 `enabled` 改回 true，确保发件邮箱的 Gmail 连接可用，先跑一次 `digest.py` 的 dry-run 看输出（脚本支持只打印不发送的预览模式），确认无误后再启用定时任务。发信需经批准的卡片时，等批准；没发成要如实汇报，不要谎称已发。

## 6. 从零复刻检查清单与验证方法

- 仓库：`npm install && npm run build && npm test` 全过；`dist/` 里有 `index.html`、`diary/`、`sitemap-index.xml`、`sitemap-0.xml`（原站 18 个网址）、`rss.xml`。
- 部署：推 main 后 Actions 的部署工作流成功；域名返回 200；HTTP 301 到 HTTPS；`curl` 首页能 grep 到内容。
- 分支保护：main 直推被拒；开 PR 后 `Test & Build` 出现并通过，合并按钮可用。
- 同步：放一篇测试日记到本地日记目录，跑 `blog_sync.py`（不加 `--push`）确认仓库文件生成且 frontmatter 正确；加 `--push` 确认 PR 自动创建、检查通过、合并、线上可访问。
- 评论：Supabase 里插一条待审测试评论（或从前端提交一条），跑 `review.py pending` 能看到，`approve` 后前端能看到，`reply` 后嵌套显示，`delete` 后消失。
- 订阅：前端表单提交邮箱后 `subscribers` 表里出现记录（`active = true`）；调退订 RPC 后 `active` 变 false。
- 配音：跑一次讲稿改写（确认免费 key 优先、失败自动切兜底 key），跑一次 Colab 批量（确认进度文件在写、DONE 后下载、时长与字数匹配），拷成 `<日期>.wav` 后跑同步，线上日记页出现播放器且 MP3 返回 200。
- 美化：按 §5.2 做一次小改动走完全流程（PR → 检查 → 合并 → 部署 → 线上验证 → DESIGN-LOG.md 更新）。
- 收录：Search Console 验证通过、sitemap 已提交；Brave 提交显示 Success。
- 常用验证命令速查：

```bash
# 本地构建与测试
cd ~/workspace/ran-blog && npm run build && npm test
# 线上检查
curl -s -o /dev/null -w "%{http_code}\n" https://ran-blog.alyse.store/
curl -s -o /dev/null -w "%{http_code}\n" https://ran-blog.alyse.store/diary/<日期>/
curl -s -o /dev/null -w "%{http_code}\n" https://ran-blog.alyse.store/audio/<日期>.mp3
# sitemap 网址数
grep -o "<loc>" dist/sitemap-0.xml | wc -l
# 同步试跑（不提交）
python3 ~/workspace/dafeiyu/scripts/blog_sync.py
# 评论待审
python3 ~/workspace/ran-blog-backend/review.py pending
```

## 7. 常见坑

- `blog_sync.py` 报「PR 检查未通过」但实际是检查还没报到（`no checks reported`）：不是真的失败。等 `Test & Build` 检查出结果后再手动 `gh pr merge --merge --delete-branch` 合并，不要重复建 PR。
- `gh pr merge` 遇 502：先核实合并是否已落 main（2026-11-22 实测：GitHub API 返回 502，但合并提交实际已落 main）。已落 main 时不要重复合并；在 PR 留言说明后关闭，部署没跑起来就用 `workflow_dispatch` 手动触发一次部署。
- 推含工作流文件的分支被拒：推分支的账号没有 workflow scope。切到有 workflow scope 的账号再推，操作完切回（同步脚本与美化流程都这么做）。
- 文件名冲突丢母带：新旧配音版本都叫 `<日期>-omnivoice.wav`，下载新版会直接覆盖旧版（2026-11-28 实测：45 分钟版 129MB WAV 被覆盖，只剩 MP3）。换版前先把旧版另存再下载新版。
- Supabase 免费项目 7 天无活动会暂停：靠每 2 小时一次的评论巡查查库保活；长期不巡查会断。
- Google Search Console 不要走网域资源 + DNS TXT：子域名已有 CNAME 指向 GitHub Pages 时不能再挂 TXT，验证走不通；用网址前缀资源 + HTML 文件验证。
- Colab 里不要走 Gradio Demo 的 `--share`：隧道 TLS 失败。改走 Python API 批量脚本。
- Colab 提示「连的是 GPU 但没用 GPU」时点 ✕ 关掉，绝不要点「更改为标准运行时」。
- `colab run` 的子进程必须 `python -u`：否则无缓冲输出缺失会被 `--timeout` 的静默判定掐掉任务。
- `colab stop` 有 Length Required 的 bug，停不掉就放着等闲置自动断开，不要反复试。
- 同步脚本只认 `<日期>.wav` 为当日总音频，OmniVoice 产物名是 `<日期>-omnivoice.wav`，须先拷成 `<日期>.wav` 再跑同步；直接把 `-omnivoice.wav` 拷过去同步会认不到音频，frontmatter 里就没有 `audio` 字段，页面也不显示播放器。
- 免费层级 Gemini 3.8-flash 高峰期会 503/超时：这是免费层级容量问题，不是 key 坏了（同 key 调 `gemini-3.5-flash-lite` 正常）。讲稿脚本的兜底切换就是为此准备的，不要因此重建 key。
- 免费层级 Gemini 没有 Neon 这类高阶模型的免费档：Neon 按量计费且无免费层级，讲稿改写不需要它，不要换。

## 8. 来源清单

- `~/MEMORY.md`（第 19、20、30 行）：博客上线与配置、每日美化规则、配音新流程与双 key、文件名冲突教训、收录状态。
- `~/workspace/ran-blog/README.md`：仓库说明、部署方式、同步入口。
- `~/workspace/ran-blog/astro.config.mjs`：site、sitemap 集成、/rss 重定向。
- `~/workspace/ran-blog/package.json`：依赖与脚本。
- `~/workspace/ran-blog/src/content.config.ts`：diary 集合 schema。
- `~/workspace/ran-blog/src/content/diary/2026-11-28.md`：frontmatter 示例。
- `~/workspace/ran-blog/src/pages/rss.xml.js`：RSS 生成逻辑（全文 + 200 字摘要）。
- `~/workspace/ran-blog/src/components/Comments.astro`：前端评论读/提交（PostgREST + RLS）。
- `~/workspace/ran-blog/src/components/Subscribe.astro`：订阅/退订 RPC（subscribe_email / unsubscribe_email）。
- `~/workspace/ran-blog/src/layouts/DiaryPost.astro`：audio 字段有则渲染播放器。
- `~/workspace/ran-blog/src/data/submissions.json`：投稿页数据结构与字段（起草时 18 条）。
- `~/workspace/ran-blog/DESIGN-LOG.md`：美化台账结构与已完成记录（截至 2026-11-28）。
- `~/workspace/ran-blog/.github/workflows/deploy.yml`：Pages 部署流程。
- `~/workspace/ran-blog/.github/workflows/ci.yml`：Test & Build 检查。
- `~/workspace/ran-blog/public/CNAME`、`~/workspace/ran-blog/public/robots.txt`：域名与爬虫配置。
- `~/workspace/ran-blog/dist/sitemap-index.xml`、`~/workspace/ran-blog/dist/sitemap-0.xml`：sitemap 实测 18 个网址。
- `~/workspace/goals/xiaoran-bilibili-patrol/crons/daily/dafeiyu-blog-sync__daily@21:05:00.md`：同步任务完整提示词与流程。
- `~/workspace/goals/xiaoran-bilibili-patrol/crons/daily/dafeiyu-blog-beautify__daily@20:00:00.md`：美化任务完整提示词、红线与流程。
- `~/workspace/goals/xiaoran-bilibili-patrol/crons/hourly/dafeiyu-comments-patrol__interval@2h.md`：评论巡查完整提示词与回复口径。
- `~/workspace/goals/xiaoran-bilibili-patrol/crons/daily/ran-blog-digest-email__daily@21:10:00.md`：digest 任务完整提示词（已禁用）。
- `~/workspace/goals/xiaoran-bilibili-patrol/files/ran-blog-plan.md`：建站 v4 路线定稿文档。
- `~/workspace/dafeiyu/scripts/blog_sync.py`：同步脚本全文（frontmatter 生成、音频转码、PR 流程、账号切换）。
- `~/workspace/ran-blog-backend/review.py`：评论审核脚本全文（Management API、五条命令、SQL）。
- `~/workspace/ran-blog-backend/digest.py`：digest 脚本（RSS 取最新、订阅者查询、Gmail 发送、去重状态）。
- `~/workspace/ran-blog-backend/server.py`：旧 SQLite 评论后端（2026-11-18 前用，现已停用，仅作历史记录）。
- `~/workspace/omnivoice-dub/README.md`：配音新流程、双 key、Colab 注意事项、文件名冲突教训。
- `~/workspace/omnivoice-dub/evening_batch.py`：晚间批量配音脚本（切块、静音、输出格式）。
- `~/workspace/omnivoice-dub/gemini_narrate.py`：讲稿改写脚本（双 key 兜底逻辑）。
- `~/workspace/omnivoice-dub/colab-test-run.py`：Colab 跑批入口（内嵌讲稿、拉取脚本与参考音频）。
- `~/workspace/dafeiyu/scripts/diary_audio.py`：旧增量配音脚本（Mimo TTS，已被晚间批量取代）。
- `~/memory/2026-11-22.md`：`gh pr merge` 502 但合并实际已落 main 的实测记录。
