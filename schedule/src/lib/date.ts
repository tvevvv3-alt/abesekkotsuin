// 日付は端末のローカル時刻で "YYYY-MM-DD" 文字列として扱う（UTC ずれ防止）。

export function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function parseDateStr(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(s: string, n: number): string {
  const d = parseDateStr(s);
  d.setDate(d.getDate() + n);
  return toDateStr(d);
}

// 日曜始まりで、月の表示に必要な日付（前後月の端数を含む）を週ごとに返す
export function monthGrid(year: number, month: number): string[][] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  const last = new Date(year, month + 1, 0);
  const weeks: string[][] = [];
  const cur = new Date(start);
  while (cur <= last || cur.getDay() !== 0) {
    if (cur.getDay() === 0) weeks.push([]);
    weeks[weeks.length - 1].push(toDateStr(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return weeks;
}

export const WEEKDAYS = ["日", "月", "火", "水", "木", "金", "土"];

export function weekday(s: string): number {
  return parseDateStr(s).getDay();
}

// 月曜・木曜は長男・次男のお弁当の日
export function isBentoDay(s: string): boolean {
  const w = weekday(s);
  return w === 1 || w === 4;
}

export function ageLabel(birth: string | null, on: string): string | null {
  if (!birth) return null;
  const b = parseDateStr(birth);
  const t = parseDateStr(on);
  let months = (t.getFullYear() - b.getFullYear()) * 12 + (t.getMonth() - b.getMonth());
  if (t.getDate() < b.getDate()) months -= 1;
  if (months < 0) return null;
  if (months < 24) return `${Math.floor(months / 12)}歳${months % 12}か月`;
  return `${Math.floor(months / 12)}歳`;
}
