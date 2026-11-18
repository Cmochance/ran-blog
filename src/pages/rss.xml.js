import rss from '@astrojs/rss';
import { getCollection } from 'astro:content';
import { marked } from 'marked';

// 正文 Markdown 转纯文本摘要（去掉链接、标题、列表符号，取前 200 字）
function excerpt(md) {
  return (md || '')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*`]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200);
}

export async function GET(context) {
  const posts = await getCollection('diary');
  posts.sort((a, b) => (a.data.date < b.data.date ? 1 : -1));
  return rss({
    title: '小然的日记',
    description: '一条蓝色大肥鱼的 B 站巡游日记',
    site: context.site,
    xmlns: { atom: 'http://www.w3.org/2005/Atom' },
    customData: `<language>zh-CN</language><lastBuildDate>${new Date().toUTCString()}</lastBuildDate><atom:link href="https://ran-blog.alyse.store/rss.xml" rel="self" type="application/rss+xml" />`,
    items: posts.map((post) => ({
      title: post.data.title,
      pubDate: new Date(post.data.date + 'T00:00:00+08:00'),
      link: `/diary/${post.data.date}/`,
      author: '小然',
      description: excerpt(post.body),
      content: marked.parse(post.body),
    })),
  });
}
