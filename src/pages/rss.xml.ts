import rss from '@astrojs/rss';
import type { APIContext } from 'astro';
import { SITE, SECTIONS } from '../site.config';
import { getPosts, postTitle, postUrl, excerpt } from '../lib/posts';

export async function GET(context: APIContext) {
  const posts = (await getPosts()).slice(0, 30);
  return rss({
    title: SITE.title,
    description: SITE.description,
    site: context.site!,
    trailingSlash: true,
    items: posts.map((p) => ({
      title: postTitle(p),
      link: postUrl(p),
      pubDate: p.data.date,
      description: excerpt(p, 200),
      categories: [SECTIONS[p.collection].name],
    })),
    customData: `<language>${SITE.lang}</language>`,
  });
}
