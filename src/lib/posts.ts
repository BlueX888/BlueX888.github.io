import { getCollection, type CollectionEntry } from 'astro:content';
import { SECTION_KEYS, type SectionKey } from '../site.config';

export type Post = CollectionEntry<SectionKey>;

const visible = (p: Post) => import.meta.env.DEV || !p.data.draft;
const byDateDesc = (a: Post, b: Post) => b.data.date.getTime() - a.data.date.getTime();

export async function getPosts(section?: SectionKey): Promise<Post[]> {
  const keys = section ? [section] : SECTION_KEYS;
  const all = (await Promise.all(keys.map((k) => getCollection(k)))).flat() as Post[];
  return all.filter(visible).sort(byDateDesc);
}

export function postSlug(p: Post): string {
  return p.data.slug ?? p.id;
}

export function postUrl(p: Post): string {
  return `/${p.collection}/${postSlug(p)}/`;
}

/** 日记可以没有标题，用「2026年9月8日」代替 */
export function postTitle(p: Post): string {
  if (p.data.title) return p.data.title;
  const d = p.data.date;
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`;
}

/** 中文字数（按字符计，去掉空白与 Markdown 符号） */
export function wordCount(body = ''): number {
  const text = body
    .replace(/```[\s\S]*?```/g, '')
    .replace(/^---[\s\S]*?---/, '')
    .replace(/[#>*_`~\-\[\]()!|]/g, '')
    .replace(/\s+/g, '');
  return text.length;
}

/** 摘要：description 优先，否则取正文前 N 个字 */
export function excerpt(p: Post, n = 120): string {
  if (p.data.description) return p.data.description;
  const text = (p.body ?? '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[\[([^\]|]+)(\|([^\]]+))?\]\]/g, (_, a, __, b) => b ?? a)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > n ? text.slice(0, n) + '……' : text;
}

export function allTags(posts: Post[]): [string, number][] {
  const m = new Map<string, number>();
  for (const p of posts) for (const t of p.data.tags) m.set(t, (m.get(t) ?? 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'));
}
