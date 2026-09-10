import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { dateParts } from '../src/lib/dates.ts';

const require = createRequire(import.meta.resolve('astro'));
const { load: yaml } = require('js-yaml');
const source = await readFile(new URL('../src/lib/posts.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source.replace('import.meta.env.DEV', 'false'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const entries = [];
const posts = {};
runInNewContext(compiled, {
  exports: posts,
  require: (id) => {
    if (id === 'astro:content') return { getCollection: async (key) => entries.filter((p) => p.collection === key) };
    if (id === '../site.config') return { SECTION_KEYS: ['reading', 'diary', 'learning', 'weekly'] };
    if (id === './dates') return { dateParts };
    return require(id);
  },
});

test('empty custom slugs fall back to the filename in every collection', () => {
  for (const collection of ['reading', 'diary', 'learning', 'weekly']) {
    for (const slug of [undefined, '', '   ']) {
      assert.equal(posts.postUrl({ collection, id: '2026-09-10-1436', data: { slug } }),
        `/${collection}/2026-09-10-1436/`);
    }
    assert.equal(posts.postUrl({ collection, id: 'old-name', data: { slug: ' custom ' } }),
      `/${collection}/custom/`);
  }
});

test('same-day posts sort by publication time and drafts stay hidden', async () => {
  entries.push(
    { collection: 'reading', id: 'earlier', data: { date: new Date('2026-09-10T14:36:00+08:00') } },
    { collection: 'reading', id: 'later', data: { date: new Date('2026-09-10T15:09:00+08:00') } },
    { collection: 'reading', id: 'draft', data: { date: new Date('2026-09-10T16:00:00+08:00'), draft: true } },
  );
  assert.equal((await posts.getPosts('reading')).map((p) => p.id).join(','), 'later,earlier');
});

test('display dates, fallback titles and calendar days use Beijing time', () => {
  const date = new Date('2026-12-31T16:05:00Z');
  const { year, month, day, hour, minute } = dateParts(date);
  assert.deepEqual([year, month, day, hour, minute], ['2027', '01', '01', '00', '05']);
  assert.equal(posts.postTitle({ data: { date } }), '2027年1月1日');
  assert.equal(posts.updatedDate({ data: { date, updated: new Date('2027-01-01T01:00:00Z') } }), undefined);
});

test('CMS stores offset timestamps without inserting them verbatim in filenames', async () => {
  const config = yaml(await readFile(new URL('../public/admin/config.yml', import.meta.url), 'utf8'));
  for (const collection of config.collections.filter((c) => c.folder)) {
    const date = collection.fields.find((f) => f.name === 'date');
    assert.equal(date.type, 'datetime-local');
    assert.equal(date.input_timezone, 'Asia/Shanghai');
    assert.equal(date.format, 'YYYY-MM-DDTHH:mm:ssZ');
    assert.equal(collection.slug.includes('{{fields.date}}'), false);
  }
  for (const extension of ['jpeg', 'png', 'webp']) {
    assert.deepEqual(config.media_libraries.default.config.transformations[extension],
      { format: 'webp', quality: 82, width: 2048, height: 2048 });
  }
  assert.equal(config.media_libraries.default.config.transformations.gif, undefined);
});

test('new article command keeps publication time and timezone', async () => {
  const cwd = await mkdtemp(join(tmpdir(), 'chaoran-post-test-'));
  try {
    await cp(new URL('../content/_templates', import.meta.url), join(cwd, 'content/_templates'), { recursive: true });
    const before = Date.now();
    execFileSync(process.execPath, [new URL('../scripts/new.mjs', import.meta.url).pathname, 'reading', 'test-post'], { cwd });
    const article = await readFile(join(cwd, 'content/reading/test-post.md'), 'utf8');
    const data = yaml(article.split('---')[1]);
    assert.ok(new Date(data.date).getTime() >= before);
    assert.ok(new Date(data.date).getTime() <= Date.now());
    assert.equal(data.draft, true);
    assert.match(article, /date: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
  } finally {
    await rm(cwd, { recursive: true, force: true });
  }
});

test('the legacy editor preserves both date-only values and offset timestamps', async () => {
  const config = yaml(await readFile(new URL('../.pages.yml', import.meta.url), 'utf8'));
  for (const collection of config.content.filter((c) => c.type === 'collection')) {
    const date = collection.fields.find((f) => f.name === 'date');
    assert.equal(date.type, 'string');
    assert.equal(date.required, true);
    const pattern = new RegExp(date.pattern);
    for (const value of ['2026-09-10', '2026-09-10T15:09:00+08:00', '2026-09-10T07:09:00.123Z']) {
      assert.match(value, pattern);
    }
    assert.doesNotMatch('2026-09-10T15:09', pattern);
    assert.doesNotMatch('not-a-date', pattern);
  }
});
