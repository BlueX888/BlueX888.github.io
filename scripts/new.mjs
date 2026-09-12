#!/usr/bin/env node
/**
 * 新建一篇文章：
 *   pnpm new reading 一本书的名字      -> content/reading/一本书的名字.md
 *   pnpm new learning 学习主题          -> content/learning/学习主题.md
 *   pnpm new diary                     -> content/diary/2026-09-08.md（今天）
 *   pnpm new weekly                    -> content/weekly/2026-W37.md（本周）
 *   pnpm new thoughts                  -> content/thoughts/2026-09-08-1430.md（此刻，不写标题）
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [section, ...rest] = process.argv.slice(2);
const SECTIONS = ['thoughts', 'reading', 'diary', 'learning', 'weekly'];
if (!SECTIONS.includes(section)) {
  console.error(`用法: pnpm new <${SECTIONS.join('|')}> [标题]`);
  process.exit(1);
}

const now = new Date();
const pad = (n) => String(n).padStart(2, '0');
const today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

function isoWeek(d) {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return { year: t.getUTCFullYear(), week: Math.ceil(((t - yearStart) / 86400000 + 1) / 7) };
}

let title = rest.join(' ').trim();
let filename;
let template;
if (section === 'diary') {
  filename = title ? `${today}-${title}` : today;
  template = 'diary';
} else if (section === 'thoughts') {
  // 不写标题，文件名就是发布时刻；同一分钟再发一条时自动加 -2、-3
  const dir = join('content', 'thoughts');
  filename = `${today}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  for (let n = 2; existsSync(join(dir, `${filename}.md`)); n += 1) filename = `${filename}-${n}`;
  template = 'thought';
} else if (section === 'weekly') {
  const { year, week } = isoWeek(now);
  filename = `${year}-W${pad(week)}`;
  title ||= `${year} 年第 ${week} 周`;
  template = 'weekly';
} else {
  if (!title) {
    console.error('读书 / 学习 栏目需要一个标题，例如：pnpm new reading 人类简史');
    process.exit(1);
  }
  filename = title;
  template = 'post';
}

const dir = join('content', section);
mkdirSync(dir, { recursive: true });
const file = join(dir, `${filename.replace(/[\\/:*?"<>|]/g, '-')}.md`);
if (existsSync(file)) {
  console.error(`已存在：${file}`);
  process.exit(1);
}
const body = readFileSync(join('content', '_templates', `${template}.md`), 'utf8')
  .replaceAll('{{title}}', title)
  .replaceAll('{{date}}', now.toISOString());
writeFileSync(file, body);
console.log(`已创建 ${file}`);
