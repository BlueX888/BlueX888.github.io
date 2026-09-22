import { defineCollection } from 'astro:content';
import { z } from 'astro/zod';
import { glob } from 'astro/loaders';
import { entryIdFromPath } from './lib/ids';

const postSchema = z.object({
  /** 标题。日记可以不写，会用日期代替。 */
  title: z.string().optional(),
  date: z.coerce.date(),
  updated: z.coerce.date().optional(),
  description: z.string().optional(),
  /** 自定义网址中的最后一段，不填则用文件名。 */
  slug: z.string().optional(),
  /** true 时本地能预览，线上不发布 */
  draft: z.boolean().default(false),
});

export type PostData = z.infer<typeof postSchema>;

function section(key: string) {
  return defineCollection({
    loader: glob({
      pattern: ['**/*.md', '!**/_*', '!**/_*/**'],
      base: `./content/${key}`,
      generateId: ({ entry }) => entryIdFromPath(entry),
    }),
    schema: postSchema,
  });
}

/**
 * 每日打卡。一天一个文件，frontmatter 里记当天每项习惯有没有做。
 * 日期字段和其它栏目保持一致，好让页面统一按北京时间算「是哪一天」。
 */
const checkin = defineCollection({
  loader: glob({
    pattern: ['**/*.md', '!**/_*', '!**/_*/**'],
    base: './content/checkin',
    generateId: ({ entry }) => entryIdFromPath(entry),
  }),
  schema: z.object({
    date: z.coerce.date(),
    draft: z.boolean().default(false),
    /** 当天每项习惯的完成情况；不写就是空数组 */
    habits: z
      .array(z.object({ name: z.string().trim().min(1), done: z.boolean().default(false) }))
      .default([]),
  }),
});

const pages = defineCollection({
  loader: glob({ pattern: '*.md', base: './content/pages', generateId: ({ entry }) => entryIdFromPath(entry) }),
  schema: z.object({ title: z.string() }),
});

// 五个栏目要逐个写出来，Astro 才能为每个集合生成精确的类型
export const collections = {
  thoughts: section('thoughts'),
  reading: section('reading'),
  diary: section('diary'),
  learning: section('learning'),
  weekly: section('weekly'),
  pages,
  checkin,
};
