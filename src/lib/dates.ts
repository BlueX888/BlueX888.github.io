const formatter = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

export function dateParts(date: Date): Record<string, string> {
  return Object.fromEntries(formatter.formatToParts(date).map(({ type, value }) => [type, value]));
}
