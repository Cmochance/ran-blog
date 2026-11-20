import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://ran-blog.alyse.store',
  redirects: {
    '/rss': '/subscribe',
  },
});
