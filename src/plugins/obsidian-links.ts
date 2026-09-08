/**
 * 把 Obsidian 产生的两类链接改写成站内网址：
 *   1. 相对 Markdown 链接：[标题](../reading/某本书.md)  ->  /reading/某本书/
 *   2. 双链：[[某本书]] 或 [[reading/某本书|别名]]      ->  /reading/某本书/
 * 同时把 [[图片.png]] 这种双链图片、以及网页编辑器写入的 /attachments/图片.png 绝对路径，
 * 都改成相对路径，交给 Astro 的图片管线做压缩优化。
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECTION_KEYS } from '../site.config';
import { entryIdFromPath } from '../lib/ids';

const CONTENT_ROOT = resolve('content');
const IMAGE_RE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

function slugFromFrontmatter(file: string): string | undefined {
  try {
    const head = readFileSync(file, 'utf8').slice(0, 2000);
    const m = head.match(/^---\s*\n([\s\S]*?)\n---/);
    const slug = m?.[1].match(/^slug:\s*["']?([^"'\n]+)["']?\s*$/m)?.[1];
    return slug?.trim() || undefined;
  } catch {
    return undefined;
  }
}

/** 由 content/ 下的绝对文件路径得到站内 URL。不在栏目文件夹内则返回 undefined。 */
function urlForFile(absFile: string): string | undefined {
  const rel = relative(CONTENT_ROOT, absFile).split(sep);
  const section = rel[0];
  if (!SECTION_KEYS.includes(section as any) || rel.length < 2) return undefined;
  const slug = slugFromFrontmatter(absFile) ?? entryIdFromPath(rel.slice(1).join('/'));
  return `/${section}/${slug}/`;
}

/** 扫描全部栏目，按文件名（不含扩展名）建索引，用来解析 [[裸名字]]。 */
function findByBasename(name: string): string | undefined {
  for (const section of SECTION_KEYS) {
    const dir = join(CONTENT_ROOT, section);
    if (!existsSync(dir)) continue;
    const hit = walk(dir).find((f) => f.replace(/\.mdx?$/, '').split(sep).pop() === name);
    if (hit) return hit;
  }
  return undefined;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.mdx?$/.test(n) ? [p] : [];
  });
}

function isExternal(url: string) {
  return /^([a-z]+:|\/\/|#|\/)/i.test(url);
}

export const obsidianLinks = {
  name: 'obsidian-links',
  link(node: any, ctx: any) {
    const url: string = node.url ?? '';
    if (!url || isExternal(url) || !ctx.fileURL) return;
    const fromDir = dirname(fileURLToPath(ctx.fileURL));
    const [path, hash = ''] = url.split('#');
    const anchor = hash ? `#${hash}` : '';

    // 情况 1：显式的 .md 相对链接
    if (/\.mdx?$/.test(path)) {
      const target = urlForFile(resolve(fromDir, decodeURIComponent(path)));
      if (target) ctx.setProperty(node, 'url', target + anchor);
      return;
    }

    // 情况 2：双链。可能是 "名字" 或 "栏目/名字"
    const decoded = decodeURIComponent(path);
    const asPath = resolve(CONTENT_ROOT, decoded + '.md');
    const asRelative = resolve(fromDir, decoded + '.md');
    const file = [asPath, asRelative].find(existsSync) ?? findByBasename(decoded.split('/').pop()!);
    if (file) {
      const target = urlForFile(file);
      if (target) ctx.setProperty(node, 'url', target + anchor);
    }
  },
  image(node: any, ctx: any) {
    // 三种来源：Obsidian 的 ![[图.png]]（src="图.png"）、相对路径、网页编辑器的 /attachments/图.png
    const url: string = node.url ?? '';
    if (!url || !ctx.fileURL || !IMAGE_RE.test(url)) return;
    const isCmsPath = url.startsWith('/attachments/');
    if (!isCmsPath && isExternal(url)) return;
    const fromDir = dirname(fileURLToPath(ctx.fileURL));
    if (!isCmsPath && existsSync(resolve(fromDir, decodeURIComponent(url)))) return;
    const inAttachments = join(CONTENT_ROOT, 'attachments', decodeURIComponent(url).split('/').pop()!);
    if (existsSync(inAttachments)) {
      const rel = relative(fromDir, inAttachments).split(sep).join('/');
      ctx.setProperty(node, 'url', rel.startsWith('.') ? rel : './' + rel);
    }
  },
};
