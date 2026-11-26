// カルテ文字起こしの精度を上げるための「よく使う語彙」辞書（端末内＝localStorageに保存）。
// 一度書いた/入力した語を覚えておき、次回以降の手書き読み取り時に候補語として渡す。
const KEY = "chartLexicon.v1";
const MAX_STORE = 800; // これを超えたら低頻度を削って上位600に圧縮
const KEEP = 600;

type Freq = Record<string, number>;

// ひらがなだけの助詞・語尾など、ヒントにならない語は拾わない
const STOP = new Set([
  "した", "して", "する", "され", "から", "ので", "こと", "もの", "それ", "これ", "そこ",
  "ます", "です", "ある", "いる", "なる", "よう", "ため", "など", "まで", "この", "その",
]);

// テキストを「語」に分解：英数字語（ROM, ACL, 20kg, 3x10 など）＋漢字/カタカナの連続（大腿四頭筋, スクワット など）
export function tokenize(text: string): string[] {
  if (!text) return [];
  const out: string[] = [];
  for (const m of text.matchAll(/[A-Za-z][A-Za-z0-9/\-]*|\d+(?:kg|RM|rep|set|cm|mm|°|%)?/g)) out.push(m[0]);
  for (const m of text.matchAll(/[一-龠々〆ヵヶ]+|[ァ-ヴー]+/g)) out.push(m[0]);
  return out.filter((w) => w.length >= 1 && w.length <= 24 && !STOP.has(w));
}

function read(): Freq {
  if (typeof window === "undefined") return {};
  try {
    const v = JSON.parse(window.localStorage.getItem(KEY) || "{}");
    return v && typeof v === "object" ? (v as Freq) : {};
  } catch {
    return {};
  }
}

function write(f: Freq) {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(KEY, JSON.stringify(f)); } catch { /* 容量不足等は無視 */ }
}

// テキストに含まれる語を辞書に覚えさせる（頻度を加算）
export function learnLexicon(text: string) {
  const words = tokenize(text);
  if (!words.length) return;
  const f = read();
  for (const w of words) f[w] = (f[w] || 0) + 1;
  const entries = Object.entries(f);
  if (entries.length > MAX_STORE) {
    entries.sort((a, b) => b[1] - a[1]);
    write(Object.fromEntries(entries.slice(0, KEEP)));
  } else {
    write(f);
  }
}

// 読み取り時に渡す候補語（頻度の高い順に最大 limit 語）
export function loadVocab(limit = 200): string[] {
  const entries = Object.entries(read());
  if (!entries.length) return [];
  entries.sort((a, b) => b[1] - a[1]);
  return entries.slice(0, limit).map(([w]) => w);
}
