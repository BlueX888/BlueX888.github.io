/** 文件相对路径（含扩展名）-> 条目 id。保留中文，空格换成短横线。 */
export function entryIdFromPath(entry: string): string {
  return entry
    .replace(/\.mdx?$/, '')
    .split('/')
    .map((seg) => seg.trim().replace(/\s+/g, '-'))
    .join('/');
}
