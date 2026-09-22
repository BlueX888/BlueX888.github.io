import { getCollection, type CollectionEntry } from 'astro:content';
import { dateParts } from './dates';
import { CHECKIN } from '../site.config';

export type Checkin = CollectionEntry<'checkin'>;
export type HabitName = string;

/** 某一天的打卡结果。total 是那天列出的习惯项数，done 是打勾的那些。 */
export interface DayRecord {
  done: Set<HabitName>;
  total: number;
}

export interface HabitStat {
  /** 统计窗口内完成的天数 */
  done: number;
  /** 统计窗口内有记录的天数 */
  recorded: number;
  /** 累计完成天数（不限窗口） */
  total: number;
  /** 完成率：done / recorded，没有记录时为 0 */
  rate: number;
}

export interface HeatCell {
  key: string;
  level: 0 | 1 | 2 | 3 | 4;
  future: boolean;
  /** 鼠标悬停时显示的说明 */
  label: string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/* 月份标签「2026年9月」在等宽字体下大约 52px，而一格连间隙只有 17px，
   所以不到四格的月份就不写字——否则会和下一个标签叠上。 */
const MIN_LABEL_WEEKS = 4;

/* 日期一律用「北京时间 YYYY-MM-DD」这个字符串当键。
   字符串能直接比较大小、能当 Map 的键，也不会像 Date 那样被机器时区影响。
   'YYYY-MM-DD' 解析成 UTC 毫秒，取值全部走 getUTC*，加减就是纯粹的 +86400000。 */

function parseKey(key: string): number {
  const [y, m, d] = key.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

function formatKey(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Date -> 北京时间的 YYYY-MM-DD。不能用 toISOString，那是 UTC，晚上八点以后会串到前一天。 */
export function dayKey(date: Date): string {
  const { year, month, day } = dateParts(date);
  return `${year}-${month}-${day}`;
}

/** 'YYYY-MM-DD' 加几天（可以是负数），跨月跨年自动进位。 */
export function addDays(key: string, delta: number): string {
  return formatKey(parseKey(key) + delta * 86_400_000);
}

/** 0 = 周一 … 6 = 周日。和 ISO 周一致，也和 scripts/new.mjs 的 isoWeek 口径相同。 */
export function weekdayIndex(key: string): number {
  return (new Date(parseKey(key)).getUTCDay() + 6) % 7;
}

/** '2026-09-22' -> '2026年9月22日'，和 postTitle 的写法一致 */
export function dayLabel(key: string): string {
  const [y, m, d] = key.split('-').map(Number);
  return `${y}年${m}月${d}日`;
}

/** 这一天的周一 */
export function mondayOf(key: string): string {
  return addDays(key, -weekdayIndex(key));
}

/** 页面上的「今天」。构建时就是构建那一天——打卡会产生新的提交，页面也就跟着重新构建。 */
export function todayKey(now: Date = new Date()): string {
  return dayKey(now);
}

/** 打卡记录，去掉草稿（本地预览时保留），按日期从新到旧。 */
export async function getCheckins(): Promise<Checkin[]> {
  const all = (await getCollection('checkin')) as Checkin[];
  return all
    .filter((c) => import.meta.env.DEV || !c.data.draft)
    .sort((a, b) => dayKey(b.data.date).localeCompare(dayKey(a.data.date)));
}

/** 日期 -> 当天记录。一天只有一个文件是常态；万一写重了就把两边的成绩并起来，不丢任何一次打卡。 */
export function buildDayMap(checkins: Checkin[]): Map<string, DayRecord> {
  const map = new Map<string, DayRecord>();
  for (const entry of checkins) {
    const key = dayKey(entry.data.date);
    const prev = map.get(key);
    const done = new Set<HabitName>(prev?.done ?? []);
    for (const habit of entry.data.habits) if (habit.done) done.add(habit.name);
    const total = Math.max(prev?.total ?? 0, entry.data.habits.length, done.size);
    map.set(key, { done, total });
  }
  return map;
}

/** 当天完成几项 / 共几项 */
export function progressOf(record: DayRecord | undefined): { done: number; total: number } {
  return { done: record?.done.size ?? 0, total: record?.total ?? 0 };
}

/** 今天该打勾的清单。没记录的一天也把清单列全，只是都没打勾。 */
export function todayList(
  dayMap: Map<string, DayRecord>,
  key: string,
  habits: readonly string[] = CHECKIN.habits,
): { name: string; done: boolean }[] {
  const done = dayMap.get(key)?.done ?? new Set<HabitName>();
  const list = habits.map((name) => ({ name, done: done.has(name) }));
  // 记录里出现的、不在固定清单上的习惯也列出来，别让它们凭空消失。
  for (const name of done) if (!habits.includes(name)) list.push({ name, done: true });
  return list;
}

/** 固定清单 + 记录里出现过的其它习惯（完成次数多的排前面） */
export function habitNames(
  dayMap: Map<string, DayRecord>,
  habits: readonly string[] = CHECKIN.habits,
): HabitName[] {
  const extra = new Map<HabitName, number>();
  for (const record of dayMap.values()) {
    for (const name of record.done) {
      if (!habits.includes(name)) extra.set(name, (extra.get(name) ?? 0) + 1);
    }
  }
  const rest = [...extra.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  return [...habits, ...rest];
}

/**
 * 连续天数：今天打勾就从今天往前数，今天还没打就从昨天往前数（今天还没过完，不算断）。
 * 中间缺记录的那天算中断——和热力图一个语义。
 * 只看记录不看日历，所以连续的前提是「这段时间有记录」。
 */
export function streakOf(dayMap: Map<string, DayRecord>, habit: HabitName, today: string): number {
  const hit = (key: string) => dayMap.get(key)?.done.has(habit) ?? false;
  let cursor = hit(today) ? today : addDays(today, -1);
  let streak = 0;
  while (hit(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

/** 近 windowDays 天的完成情况。分子分母都只算有记录的天数——没记录不代表没做到，不该算失败。 */
export function habitStats(
  dayMap: Map<string, DayRecord>,
  habit: HabitName,
  today: string,
  windowDays: number = CHECKIN.windowDays,
): HabitStat {
  let done = 0;
  let recorded = 0;
  for (let i = 0; i < windowDays; i += 1) {
    const record = dayMap.get(addDays(today, -i));
    if (!record) continue;
    recorded += 1;
    if (record.done.has(habit)) done += 1;
  }
  let total = 0;
  for (const record of dayMap.values()) if (record.done.has(habit)) total += 1;
  return { done, recorded, total, rate: recorded ? done / recorded : 0 };
}

/** 完成比例 -> 0…4 档，对应热力图的深浅 */
function levelOf(record: DayRecord | undefined): HeatCell['level'] {
  if (!record || record.total === 0) return 0;
  const ratio = Math.min(1, record.done.size / record.total);
  if (ratio === 0) return 0;
  if (ratio < 1 / 3) return 1;
  if (ratio < 2 / 3) return 2;
  if (ratio < 1) return 3;
  return 4;
}

/**
 * 热力图矩阵：列 = 周（周一起始），行 = 星期，最后一列的周一 … 周日对齐到 end 所在的那一周。
 * 今天之后的格子标 future，渲染成透明，好让最后一列不塌。
 */
export function heatmap(
  dayMap: Map<string, DayRecord>,
  { weeks, end }: { weeks: number; end: string },
): { cells: HeatCell[]; monthLabels: { label: string; span: number }[] } {
  const gridStart = addDays(mondayOf(end), -(weeks - 1) * 7);
  const cells: HeatCell[] = [];
  for (let i = 0; i < weeks * 7; i += 1) {
    const key = addDays(gridStart, i);
    const record = dayMap.get(key);
    const progress = progressOf(record);
    cells.push({
      key,
      level: levelOf(record),
      future: key > end,
      label: record
        ? `${dayLabel(key)} 完成 ${progress.done}/${progress.total}`
        : `${dayLabel(key)} 没有记录`,
    });
  }

  // 月份标签：月份变化的那一列写一次，横跨该月的周数。
  // 一开始或结尾只有一两周的月份放不下「2026年9月」这几个字，就留空不写，免得上一个标签被压到。
  const months: { label: string; span: number }[] = [];
  for (let w = 0; w < weeks; w += 1) {
    const [year, month] = addDays(gridStart, w * 7).split('-').map(Number);
    const label = `${year}年${month}月`;
    const previous = months.at(-1);
    if (previous?.label === label) previous.span += 1;
    else months.push({ label, span: 1 });
  }
  const monthLabels = months.map((m) => ({ label: m.span >= MIN_LABEL_WEEKS ? m.label : '', span: m.span }));
  return { cells, monthLabels };
}

/** 热力图范围内有记录的天数和全打满的天数，用来写无障碍说明 */
export function heatSummary(cells: HeatCell[]): { recorded: number; full: number } {
  const past = cells.filter((cell) => !cell.future && cell.level > 0);
  return { recorded: past.length, full: past.filter((cell) => cell.level === 4).length };
}
