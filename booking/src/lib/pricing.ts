// 自費の料金計算（担当×メニュー30/60・通電×初診/再診×学生/一般）を
// 個別売上（自動入力）と予約ウィザード（料金表示）で共有する。

export type SelfPrices = { p30f: number; p30r: number; p60f: number; p60r: number };
export type SelfOptions = {
  tsuden_ippan: number;
  tsuden_gakusei: number;
  jikangai_ippan: number;
  jikangai_gakusei: number;
  student_max_age: number;
};

export const DEFAULT_OPTIONS: SelfOptions = {
  tsuden_ippan: 3300,
  tsuden_gakusei: 2750,
  jikangai_ippan: 2750,
  jikangai_gakusei: 550,
  student_max_age: 22,
};

// HP掲載の既定料金（名前で割り当て。林・その他は萩原と同額）
export function defaultPrices(name: string): SelfPrices {
  if (name.includes("阿部")) return { p30f: 7700, p30r: 5500, p60f: 13200, p60r: 11000 };
  if (name.includes("澁谷") || name.includes("渋谷")) return { p30f: 7150, p30r: 4950, p60f: 12100, p60r: 10000 };
  return { p30f: 6600, p30r: 4400, p60f: 11000, p60r: 8800 };
}

export const JIKANGAI_MIN = 1230; // 20:30〜 は時間外加算

export function menuIs60(serviceName: string | null | undefined): boolean {
  return /60分|６０分/.test(serviceName || "");
}
export function menuHasTsuden(serviceName: string | null | undefined): boolean {
  return /通電/.test(serviceName || "");
}

// 生年月日(YYYY-MM-DD)と基準日から満年齢
export function ageAt(birth: string | null | undefined, onDate: string): number | null {
  if (!birth || !/^\d{4}-\d{2}-\d{2}/.test(birth)) return null;
  const [by, bm, bd] = birth.slice(0, 10).split("-").map(Number);
  const [y, m, d] = onDate.split("-").map(Number);
  let a = y - by;
  if (m < bm || (m === bm && d < bd)) a--;
  return a >= 0 && a < 130 ? a : null;
}

// メニュー名・料金・オプションから、初診/再診 × 一般/学生 の自費を算出（時間外は含めない）
export function menuPrices(serviceName: string | null | undefined, p: SelfPrices, opt: SelfOptions) {
  const is60 = menuIs60(serviceName);
  const baseIni = is60 ? p.p60f : p.p30f;
  const baseRep = is60 ? p.p60r : p.p30r;
  const tsuI = menuHasTsuden(serviceName) ? opt.tsuden_ippan : 0;
  const tsuG = menuHasTsuden(serviceName) ? opt.tsuden_gakusei : 0;
  return {
    initialIppan: baseIni + tsuI,
    initialGakusei: baseIni + tsuG,
    repeatIppan: baseRep + tsuI,
    repeatGakusei: baseRep + tsuG,
    studentDiffers: tsuI !== tsuG,
  };
}
