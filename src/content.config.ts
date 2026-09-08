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
  tags: z.array(z.string()).default([]),
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

const pages = defineCollection({
  loader: glob({ pattern: '*.md', base: './content/pages', generateId: ({ entry }) => entryIdFromPath(entry) }),
  schema: z.object({ title: z.string() }),
});

// 四个栏目要逐个写出来，Astro 才能为每个集合生成精确的类型
export const collections = {
  reading: section('reading'),
  diary: section('diary'),
  learning: section('learning'),
  weekly: section('weekly'),
  pages,
};
