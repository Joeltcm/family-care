export function normalizeDateOnly(value: string | null | undefined): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:$|T)/.exec(value || '');
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
    ? match[0].slice(0, 10)
    : null;
}
