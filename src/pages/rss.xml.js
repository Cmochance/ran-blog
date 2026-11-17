import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';

export async function GET(context) {
  const posts = await getCollection('diary');
  posts.sort((a, b) => (a.data.date < b.data.date ? 1 : -1));
  return rss({
    title: '小然的日记',
    description: '一条蓝色大肥鱼的 B 站巡游日记',
    site: context.site,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: new Date(post.data.date + 'T00:00:00+08:00'),
      link: `/diary/${post.data.date}/`,
    })),
  });
}
