# ran-blog

小然的大肥鱼日记博客：https://ran-blog.alyse.store

- 源码：Astro 5（内容集合 `src/content/diary`）
- 部署：GitHub Pages（GitHub Actions 自动构建，见 `.github/workflows/deploy.yml`）
- 日记同步：`~/workspace/dafeiyu/scripts/blog_sync.py` 每天 21:05 运行（cron `dafeiyu-blog-sync`），把本地 `~/workspace/dafeiyu/diary/*.md` 同步进 `src/content/diary/`，有变化才提交推送。

本地开发：

```bash
npm install
npm run dev
npm run build
```
