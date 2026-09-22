import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { dateParts } from '../src/lib/dates.ts';

const require = createRequire(import.meta.resolve('astro'));
const { load: yaml } = require('js-yaml');

// src/lib/checkin.ts 是从 astro:content 取数据的，测试里把那一层换成假的，
// 纯函数部分照常跑真实代码。import.meta.env.DEV 也替换掉，好断言草稿过滤。
const source = await readFile(new URL('../src/lib/checkin.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source.replace('import.meta.env.DEV', 'false'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS },
}).outputText;
const lib = {};
const checkin = { habits: [], weeks: 16, recentCount: 14, windowDays: 30 };
runInNewContext(compiled, {
  exports: lib,
  require: (id) => {
    if (id === 'astro:content') return { getCollection: async () => [] };
    if (id === '../site.config') return { CHECKIN: checkin };
    if (id === './dates') return { dateParts };
    return require(id);
  },
});

/** vm 里造出来的数组/对象原型和这边不是同一个，比较前先过一遍 JSON */
const plain = (value) => JSON.parse(JSON.stringify(value));

/** 造一条打卡记录：done 里的习惯名算打勾，habitNames 是当天列出的全部项目 */
const record = (date, done = [], habitNames = ['早起', '读书 30 分钟', '运动', '写作']) => ({
  id: 'x',
  collection: 'checkin',
  data: {
    date: new Date(`${date}T08:00:00+08:00`),
    habits: habitNames.map((name) => ({ name, done: done.includes(name) })),
  },
});

test('every day is addressed in Beijing time, not UTC', () => {
  assert.equal(lib.dayKey(new Date('2026-12-31T16:05:00Z')), '2027-01-01');
  assert.equal(lib.dayKey(new Date('2026-12-31T15:55:00Z')), '2026-12-31');
  assert.equal(lib.addDays('2026-12-31', 1), '2027-01-01');
  assert.equal(lib.addDays('2027-01-01', -1), '2026-12-31');
  assert.equal(lib.addDays('2026-03-01', -1), '2026-02-28');
  assert.equal(lib.addDays('2028-03-01', -1), '2028-02-29', '闰年二月');
  assert.equal(lib.dayLabel('2026-09-22'), '2026年9月22日');
});

test('weeks start on Monday so the heatmap rows match ISO weeks', () => {
  assert.equal(lib.weekdayIndex('2026-09-21'), 0);
  assert.equal(lib.weekdayIndex('2026-09-22'), 1);
  assert.equal(lib.weekdayIndex('2026-09-20'), 6, '周日是最后一行');
  assert.equal(lib.mondayOf('2026-09-22'), '2026-09-21');
  assert.equal(lib.mondayOf('2026-09-21'), '2026-09-21');
});

test('an account with no records yet still renders a complete page', () => {
  const map = lib.buildDayMap([]);
  assert.equal(map.size, 0);
  assert.equal(lib.streakOf(map, '早起', '2026-09-22'), 0);
  assert.deepEqual(plain(lib.habitStats(map, '早起', '2026-09-22', 30)), { done: 0, recorded: 0, total: 0, rate: 0 });
  assert.deepEqual(plain(lib.progressOf(map.get('2026-09-22'))), { done: 0, total: 0 });
  assert.deepEqual(
    plain(lib.todayList(map, '2026-09-22', ['早起', '运动'])),
    [{ name: '早起', done: false }, { name: '运动', done: false }],
  );

  const { cells, monthLabels } = lib.heatmap(map, { weeks: 16, end: '2026-09-22' });
  assert.equal(cells.length, 112);
  assert.equal(cells.every((c) => c.level === 0), true);
  // 最后一列的周一 … 周日对齐到 end 那一周，周二（end）之后都是空格子
  assert.equal(cells.at(-1).key, '2026-09-27', '最后一格是本周周日');
  assert.equal(cells.filter((c) => c.future).length, 5, '周三到周日还没有发生');
  assert.equal(cells.at(-1).future, true);
  assert.equal(cells.find((c) => c.key === '2026-09-22').future, false);
  assert.equal(monthLabels.reduce((n, m) => n + m.span, 0), 16, '月份标签横向铺满整个网格');
});

test('streaks count back from today, forgive an unfinished today, and break on a gap', () => {
  const map = lib.buildDayMap([
    record('2026-09-22', ['早起']),
    record('2026-09-21', ['早起']),
    record('2026-09-20', ['早起']),
    record('2026-09-18', ['早起']),
    record('2026-09-17', ['早起', '运动']),
  ]);
  assert.equal(lib.streakOf(map, '早起', '2026-09-22'), 3, '今天打过就从今天数');
  assert.equal(lib.streakOf(map, '早起', '2026-09-21'), 2, '今天还没打就从昨天数');
  assert.equal(lib.streakOf(map, '早起', '2026-09-20'), 1);
  // 09-25 前后都没有记录：上一次连着打是 09-18 / 09-17，但早就断了
  assert.equal(lib.streakOf(map, '早起', '2026-09-25'), 0, '断了的连续天数归零，不显示历史最长');
  assert.equal(lib.streakOf(map, '早起', '2026-09-19'), 2, '9-19 没有记录，从 9-18 往回数是 2 天');
  assert.equal(lib.streakOf(map, '运动', '2026-09-22'), 0);
  assert.equal(lib.streakOf(map, '运动', '2026-09-17'), 1);
});

test('completion rate only counts days that have a record', () => {
  const map = lib.buildDayMap([
    record('2026-09-22', ['早起', '运动', '写作', '读书 30 分钟']),
    record('2026-09-21', ['早起']),
    // 09-20 没记录：不能算成「没做到」
  ]);
  const stats = lib.habitStats(map, '早起', '2026-09-22', 30);
  assert.deepEqual(plain(stats), { done: 2, recorded: 2, total: 2, rate: 1 });
  assert.deepEqual(plain(lib.habitStats(map, '运动', '2026-09-22', 30)), { done: 1, recorded: 2, total: 1, rate: 0.5 });
  const window = plain(lib.habitStats(map, '早起', '2026-09-22', 1));
  assert.deepEqual(window, { done: 1, recorded: 1, total: 2, rate: 1 }, '窗口只影响分子分母，累计天数照旧');
});

test('heatmap levels follow the fraction of habits done that day', () => {
  const map = lib.buildDayMap([
    record('2026-09-22', ['早起', '读书 30 分钟', '运动', '写作']),
    record('2026-09-21', ['早起', '读书 30 分钟', '运动']),
    record('2026-09-20', ['早起', '读书 30 分钟']),
    record('2026-09-18', ['早起']),
    record('2026-09-17', []),
  ]);
  const level = (key) => lib.heatmap(map, { weeks: 3, end: '2026-09-22' }).cells.find((c) => c.key === key).level;
  assert.equal(level('2026-09-22'), 4);
  assert.equal(level('2026-09-21'), 3);
  assert.equal(level('2026-09-20'), 2);
  assert.equal(level('2026-09-18'), 1);
  assert.equal(level('2026-09-17'), 0);
  assert.equal(level('2026-09-16'), 0, '没有记录的一天也是空白');

  const cell = lib.heatmap(map, { weeks: 3, end: '2026-09-22' }).cells.find((c) => c.key === '2026-09-21');
  assert.equal(cell.label, '2026年9月21日 完成 3/4');
  const empty = lib.heatmap(map, { weeks: 3, end: '2026-09-22' }).cells.find((c) => c.key === '2026-09-16');
  assert.equal(empty.label, '2026年9月16日 没有记录');
});

test('a day only counts once even if two files land on the same date', () => {
  const map = lib.buildDayMap([
    record('2026-09-22', ['早起']),
    record('2026-09-22', ['运动']),
  ]);
  assert.deepEqual(plain(lib.progressOf(map.get('2026-09-22'))), { done: 2, total: 4 });
  assert.equal(lib.streakOf(map, '运动', '2026-09-22'), 1, '两份记录的成绩合并，不丢任何一次');
});

test('habits outside the fixed list are still counted, after the listed ones', () => {
  const map = lib.buildDayMap([record('2026-09-22', ['早起', '冥想'], ['早起', '冥想'])]);
  assert.deepEqual(plain(lib.habitNames(map, ['早起', '运动'])), ['早起', '运动', '冥想']);
  assert.equal(lib.habitStats(map, '冥想', '2026-09-22', 30).total, 1);
  assert.deepEqual(
    plain(lib.todayList(map, '2026-09-22', ['早起', '运动'])),
    [{ name: '早起', done: true }, { name: '运动', done: false }, { name: '冥想', done: true }],
  );
});

test('drafts stay out of the statistics unless we are previewing locally', async () => {
  const draftSource = source.replace('import.meta.env.DEV', 'true');
  const draftLib = {};
  runInNewContext(ts.transpileModule(draftSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports: draftLib,
    require: (id) => {
      if (id === 'astro:content') {
        return { getCollection: async () => [{ ...record('2026-09-22', ['早起']), data: { ...record('2026-09-22').data, draft: true } }] };
      }
      if (id === '../site.config') return { CHECKIN: checkin };
      if (id === './dates') return { dateParts };
      return require(id);
    },
  });
  assert.equal((await lib.getCheckins()).length, 0, '线上不统计草稿');
  assert.equal((await draftLib.getCheckins()).length, 1, '本地预览看得到草稿');
});

test('records are read newest first', async () => {
  const source2 = {};
  runInNewContext(
    ts.transpileModule(source.replace('import.meta.env.DEV', 'false'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText,
    {
      exports: source2,
      require: (id) => {
        if (id === 'astro:content') {
          return {
            getCollection: async () => [
              { ...record('2026-09-20', ['早起']), data: { ...record('2026-09-20').data, draft: false } },
              { ...record('2026-09-22', ['早起']), data: { ...record('2026-09-22').data, draft: false } },
              { ...record('2026-09-21', ['早起']), data: { ...record('2026-09-21').data, draft: false } },
            ],
          };
        }
        if (id === '../site.config') return { CHECKIN: checkin };
        if (id === './dates') return { dateParts };
        return require(id);
      },
    },
  );
  const order = (await source2.getCheckins()).map((c) => lib.dayKey(c.data.date));
  assert.deepEqual(plain(order), ['2026-09-22', '2026-09-21', '2026-09-20']);
});

test('the habit list is identical in the site config, the template and both editors', async () => {
  const configSource = await readFile(new URL('../src/site.config.ts', import.meta.url), 'utf8');
  const siteConfig = {};
  runInNewContext(ts.transpileModule(configSource.replace('import.meta.env', '({})'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    exports: siteConfig,
    require,
  });
  const habits = siteConfig.CHECKIN.habits;
  assert.equal(habits.length > 0, true);

  const named = (list) => list.map((item) => (typeof item === 'string' ? item : item.name));

  const template = yaml((await readFile(new URL('../content/_templates/checkin.md', import.meta.url), 'utf8')).split('---')[1]);
  assert.deepEqual(plain(named(template.habits)), plain(habits), 'content/_templates/checkin.md');

  const sveltia = yaml(await readFile(new URL('../public/admin/config.yml', import.meta.url), 'utf8'));
  const sveltiaCheckin = sveltia.collections.find((c) => c.name === 'checkin');
  const sveltiaHabits = sveltiaCheckin.fields.find((f) => f.name === 'habits');
  assert.deepEqual(plain(named(sveltiaHabits.default)), plain(habits), 'public/admin/config.yml');

  // Pages CMS 的列表项不支持默认值，清单只存在另外三处；那边改用「点 Add an item」现加。
  const pages = yaml(await readFile(new URL('../.pages.yml', import.meta.url), 'utf8'));
  const pagesCheckin = pages.content.find((c) => c.name === 'checkin');
  assert.equal(pagesCheckin.fields.find((f) => f.name === 'habits').default, undefined, '.pages.yml');
});

test('both editors expose the check-in collection with the same field shape', async () => {
  const sveltia = yaml(await readFile(new URL('../public/admin/config.yml', import.meta.url), 'utf8'));
  const sveltiaCheckin = sveltia.collections.find((c) => c.name === 'checkin');
  assert.equal(sveltiaCheckin.folder, 'content/checkin');
  assert.equal(sveltiaCheckin.slug, '{{year}}-{{month}}-{{day}}', '一天一个文件');
  const habits = sveltiaCheckin.fields.find((f) => f.name === 'habits');
  assert.equal(habits.widget, 'list');
  assert.deepEqual(plain(habits.fields.map((f) => [f.name, f.widget])), [['name', 'string'], ['done', 'boolean']]);
  // 列表摘要只支持 date / default / ternary / truncate 四个过滤器，写别的会静默失效
  assert.doesNotMatch(sveltiaCheckin.summary, /habits/, '摘要不能引用列表字段');
  // 草稿开关在编辑页里，后台的「发布上线」按钮靠它才会出现
  assert.equal(sveltiaCheckin.fields.some((f) => f.name === 'draft'), true);

  const pages = yaml(await readFile(new URL('../.pages.yml', import.meta.url), 'utf8'));
  const pagesCheckin = pages.content.find((c) => c.name === 'checkin');
  assert.equal(pagesCheckin.path, 'content/checkin');
  assert.equal(pagesCheckin.filename.template, '{year}-{month}-{day}.md');
  const pagesHabits = pagesCheckin.fields.find((f) => f.name === 'habits');
  // Pages CMS 没有 list 这个字段类型，条目要写成 object 加 list 修饰符才会渲染成可增删的列表
  assert.equal(pagesHabits.type, 'object', 'Pages CMS 的 type 只能是 object / block 这类，没有 list');
  assert.notEqual(pagesHabits.list, undefined, '少了 list 修饰符就渲染不出列表');
  assert.deepEqual(plain(pagesHabits.fields.map((f) => [f.name, f.type])), [['name', 'string'], ['done', 'boolean']]);
});

test('committed check-in files are named after the day and carry the habit list', async () => {
  const { readdir } = await import('node:fs/promises');
  const files = await readdir(new URL('../content/checkin', import.meta.url));
  for (const name of files.filter((f) => f.endsWith('.md'))) {
    assert.match(name, /^\d{4}-\d{2}-\d{2}\.md$/, `${name} 应以日期命名`);
    const data = yaml((await readFile(new URL(`../content/checkin/${name}`, import.meta.url), 'utf8')).split('---')[1]);
    assert.ok(data.date, `${name} 缺少 date`);
    assert.equal(lib.dayKey(new Date(data.date)), name.replace(/\.md$/, ''), `${name} 的 date 换算成北京时间应该就是文件名`);
    for (const habit of data.habits ?? []) assert.equal(typeof habit.done, 'boolean', `${name} 的 ${habit.name} 缺少 done`);
  }
});
