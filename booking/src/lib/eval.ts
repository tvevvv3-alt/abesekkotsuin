// 体幹評価（3ヶ月に1回）の共通ロジック。
// 5項目を0〜7点で評価し、今回/前回のレーダーチャート付きレポート(SVG)を作る。
// SVGは管理画面のプレビューと、ブラウザでのPNG化→LINE画像送信で共有する。

export type EvalKey = "operation" | "balance" | "handstand" | "ring" | "boxjump";

export interface EvalScores {
  operation: number | null; // 身体操作
  balance: number | null; // バランス
  handstand: number | null; // 壁倒立
  ring: number | null; // 吊り革ぶら下がり
  boxjump: number | null; // BOXジャンプ
}

export const EMPTY_SCORES: EvalScores = {
  operation: null,
  balance: null,
  handstand: null,
  ring: null,
  boxjump: null,
};

export interface EvalCat {
  key: EvalKey;
  label: string; // レーダー・表の見出し
  color: string; // テーマ色
  desc: string; // 能力の説明
  levels: string[]; // 1〜7のレベル説明
}

// スプレッドシート「体幹評価シート」準拠のルーブリック
export const EVAL_CATS: EvalCat[] = [
  {
    key: "operation",
    label: "身体操作",
    color: "#3b5ba5",
    desc: "体幹と四肢の連動性。姿勢保持・動きのコントロール能力。",
    levels: [
      "ブリッジ可",
      "ブリッジ15秒キープ",
      "ブリッジ片脚キープ 左右5秒",
      "3点倒立カエル足",
      "ブリッジ反転 左右",
      "3点倒立開脚前後左右",
      "3点倒立回旋2回",
    ],
  },
  {
    key: "balance",
    label: "バランス",
    color: "#4a9c53",
    desc: "片脚立ちや動的バランス能力。軸の安定性と重心コントロール。",
    levels: ["片足立ち20秒", "0〜0.5", "ターン〜1.0", "1.1〜2.0", "2.1以上", "メディシンボール1.0", "ウォーターバッグ1.0"],
  },
  {
    key: "handstand",
    label: "壁倒立",
    color: "#e08a2e",
    desc: "肩甲骨・体幹の支持力。逆さ姿勢での安定と協調性。",
    levels: [
      "ペアポジション安定",
      "ハイベア20秒",
      "壁倒立 腹部20秒",
      "壁倒立 背部20秒",
      "壁倒立 左右体重移動6回",
      "2M往復移動",
      "パルクール往復移動",
    ],
  },
  {
    key: "ring",
    label: "吊り革",
    color: "#d24b52",
    desc: "握力＋体幹持久力。ぶら下がりでの保持時間や姿勢コントロール。",
    levels: [
      "両手20秒以下",
      "両手21秒〜",
      "両手体幹前後スイング",
      "片手リリース2秒ずつ3回",
      "つり革移動6つ",
      "赤ポール",
      "赤ポール往復",
    ],
  },
  {
    key: "boxjump",
    label: "BOXジャンプ",
    color: "#7b5ea8",
    desc: "瞬発力・リズム感・下肢パワー。",
    levels: ["0〜15", "16〜17", "18〜19", "20〜24", "25〜28", "29〜30", "31以上"],
  },
];

export const EVAL_MAX = 7;

export function evalTotal(s: EvalScores): number {
  return EVAL_CATS.reduce((sum, c) => sum + (s[c.key] ?? 0), 0);
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// M/D 表示
export function fmtEvalDate(d: string): string {
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d;
  return `${m[1]}/${Number(m[2])}/${Number(m[3])}`;
}

// レーダー頂点座標（0=上、時計回り）
function radarPoints(cx: number, cy: number, r: number, scores: EvalScores): string {
  return EVAL_CATS.map((c, i) => {
    const ang = -Math.PI / 2 + (i * 2 * Math.PI) / EVAL_CATS.length;
    const v = (scores[c.key] ?? 0) / EVAL_MAX;
    const x = cx + Math.cos(ang) * r * v;
    const y = cy + Math.sin(ang) * r * v;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function axisPoint(cx: number, cy: number, r: number, i: number, level: number): [number, number] {
  const ang = -Math.PI / 2 + (i * 2 * Math.PI) / EVAL_CATS.length;
  const v = level / EVAL_MAX;
  return [cx + Math.cos(ang) * r * v, cy + Math.sin(ang) * r * v];
}

export interface EvalReportInput {
  name: string;
  date: string; // 今回の評価日
  curr: EvalScores;
  prev: EvalScores | null; // 前回（無ければ今回のみ）
  prevDate?: string | null;
  comment?: string | null;
  images?: Partial<Record<EvalKey, string>>; // 項目イラスト（URL or dataURI）
}

// レポートSVG（幅760）。ブラウザでPNG化してLINE画像送信、管理画面プレビューにも使う。
export function buildEvalSvg(input: EvalReportInput): string {
  const W = 760;
  const H = 1090;
  const { name, date, curr, prev, comment } = input;
  const NAVY = "#0f1f40";
  const GOLD = "#c9a24b";
  const CURR = "#111827"; // 今回＝黒
  const PREV = "#e39aa0"; // 前回＝ピンク

  // --- ヘッダー ---
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'Hiragino Sans','Hiragino Kaku Gothic ProN','Noto Sans JP',sans-serif">`;
  svg += `<rect width="${W}" height="${H}" fill="#ffffff"/>`;
  svg += `<rect x="0" y="0" width="${W}" height="64" fill="${NAVY}"/>`;
  svg += `<text x="24" y="40" fill="${GOLD}" font-size="14" font-weight="bold" letter-spacing="2">TRA 体幹教室</text>`;
  svg += `<text x="${W - 24}" y="40" fill="#ffffff" font-size="13" text-anchor="end">${esc(fmtEvalDate(date))} 評価</text>`;
  svg += `<text x="${W / 2}" y="104" fill="${NAVY}" font-size="26" font-weight="bold" text-anchor="middle">${esc(name || "　")} さん</text>`;
  svg += `<text x="${W / 2}" y="132" fill="#64748b" font-size="15" text-anchor="middle">運動能力成長マップ</text>`;

  // --- スコア表 ---
  const tblX = 40;
  const tblY = 156;
  const labelW = 70;
  const colW = (W - 2 * tblX - labelW) / (EVAL_CATS.length + 1); // 5項目＋合計
  const rowH = 30;
  const cols = [...EVAL_CATS.map((c) => c.label), "合計"];
  // ヘッダー行
  cols.forEach((label, i) => {
    const x = tblX + labelW + i * colW;
    const color = i < EVAL_CATS.length ? EVAL_CATS[i].color : "#334155";
    svg += `<rect x="${x}" y="${tblY}" width="${colW}" height="${rowH}" fill="${color}" opacity="0.14" stroke="#e2e8f0"/>`;
    svg += `<text x="${x + colW / 2}" y="${tblY + 20}" fill="${color}" font-size="12" font-weight="bold" text-anchor="middle">${esc(label)}</text>`;
  });
  // 今回/前回 行
  const rows: { label: string; s: EvalScores | null; color: string }[] = [
    { label: "今回", s: curr, color: CURR },
    { label: "前回", s: prev, color: PREV },
  ];
  rows.forEach((r, ri) => {
    const y = tblY + rowH * (ri + 1);
    svg += `<rect x="${tblX}" y="${y}" width="${labelW}" height="${rowH}" fill="#f8fafc" stroke="#e2e8f0"/>`;
    svg += `<text x="${tblX + labelW / 2}" y="${y + 20}" fill="${r.color}" font-size="13" font-weight="bold" text-anchor="middle">${r.label}</text>`;
    EVAL_CATS.forEach((c, i) => {
      const x = tblX + labelW + i * colW;
      const v = r.s ? r.s[c.key] : null;
      svg += `<rect x="${x}" y="${y}" width="${colW}" height="${rowH}" fill="#ffffff" stroke="#e2e8f0"/>`;
      svg += `<text x="${x + colW / 2}" y="${y + 20}" fill="${r.color}" font-size="14" font-weight="bold" text-anchor="middle">${v == null ? "–" : v}</text>`;
    });
    const xt = tblX + labelW + EVAL_CATS.length * colW;
    svg += `<rect x="${xt}" y="${y}" width="${colW}" height="${rowH}" fill="#f1f5f9" stroke="#e2e8f0"/>`;
    svg += `<text x="${xt + colW / 2}" y="${y + 20}" fill="${r.color}" font-size="15" font-weight="bold" text-anchor="middle">${r.s ? evalTotal(r.s) : "–"}</text>`;
  });

  // --- レーダーチャート ---
  const cx = W / 2;
  const cy = 480;
  const R = 150;
  // グリッド（1〜7の同心多角形）
  for (let lv = 1; lv <= EVAL_MAX; lv++) {
    const pts = EVAL_CATS.map((_, i) => axisPoint(cx, cy, R, i, lv).map((n) => n.toFixed(1)).join(",")).join(" ");
    svg += `<polygon points="${pts}" fill="none" stroke="#e2e8f0" stroke-width="1"/>`;
  }
  // 軸線＋目盛（中心の数字）
  EVAL_CATS.forEach((c, i) => {
    const [ex, ey] = axisPoint(cx, cy, R, i, EVAL_MAX);
    svg += `<line x1="${cx}" y1="${cy}" x2="${ex.toFixed(1)}" y2="${ey.toFixed(1)}" stroke="#cbd5e1" stroke-width="1"/>`;
  });
  // 前回（塗り薄ピンク）→ 今回（黒線）の順で重ねる
  if (prev) {
    svg += `<polygon points="${radarPoints(cx, cy, R, prev)}" fill="${PREV}" fill-opacity="0.25" stroke="${PREV}" stroke-width="2"/>`;
  }
  svg += `<polygon points="${radarPoints(cx, cy, R, curr)}" fill="${CURR}" fill-opacity="0.06" stroke="${CURR}" stroke-width="2.5"/>`;
  // 今回の頂点に丸
  EVAL_CATS.forEach((c, i) => {
    const [x, y] = axisPoint(cx, cy, R, i, curr[c.key] ?? 0);
    svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${CURR}"/>`;
  });
  // 項目ラベル
  EVAL_CATS.forEach((c, i) => {
    const [lx, ly] = axisPoint(cx, cy, R + 34, i, EVAL_MAX);
    const anchor = Math.abs(lx - cx) < 20 ? "middle" : lx > cx ? "start" : "end";
    svg += `<rect x="${(lx - (anchor === "middle" ? 34 : anchor === "start" ? 0 : 68)).toFixed(1)}" y="${(ly - 15).toFixed(1)}" width="68" height="20" rx="4" fill="${c.color}" opacity="0.12"/>`;
    svg += `<text x="${lx.toFixed(1)}" y="${(ly - 1).toFixed(1)}" fill="${c.color}" font-size="12.5" font-weight="bold" text-anchor="${anchor}">${esc(c.label)}</text>`;
  });
  // 凡例
  svg += `<circle cx="${cx - 70}" cy="${cy + R + 60}" r="5" fill="${CURR}"/><text x="${cx - 60}" y="${cy + R + 65}" font-size="13" fill="#334155">今回</text>`;
  svg += `<circle cx="${cx + 20}" cy="${cy + R + 60}" r="5" fill="${PREV}"/><text x="${cx + 30}" y="${cy + R + 65}" font-size="13" fill="#334155">前回</text>`;

  // --- 評価内容（ルーブリック：イラスト＋各項目の1〜7と能力の説明）---
  const imgs = input.images || {};
  const ry0 = 700;
  const colW2 = (W - 40) / EVAL_CATS.length;
  EVAL_CATS.forEach((c, i) => {
    const rx = 20 + i * colW2;
    const cxh = rx + (colW2 - 8) / 2;
    // イラスト（あれば）
    const im = imgs[c.key];
    if (im) {
      svg += `<image x="${(cxh - 33).toFixed(1)}" y="${ry0}" width="66" height="44" href="${im}" preserveAspectRatio="xMidYMid meet"/>`;
    }
    // 見出し（色バー）
    const barY = ry0 + 48;
    svg += `<rect x="${rx}" y="${barY}" width="${colW2 - 8}" height="17" rx="3" fill="${c.color}"/>`;
    svg += `<text x="${cxh}" y="${barY + 12}" fill="#ffffff" font-size="10" font-weight="bold" text-anchor="middle">${esc(c.label)}</text>`;
    // 1〜7 の基準
    c.levels.forEach((lv, j) => {
      svg += `<text x="${rx + 2}" y="${barY + 32 + j * 12}" fill="#475569" font-size="8">${esc(`${j + 1}. ${lv}`)}</text>`;
    });
    // 能力の説明
    wrapText(c.desc, 15).slice(0, 3).forEach((ln, k) => {
      svg += `<text x="${rx + 2}" y="${barY + 128 + k * 10}" fill="#94a3b8" font-size="7.5">${esc(ln)}</text>`;
    });
  });

  // --- 先生からの一言 ---
  const by = 930;
  svg += `<text x="40" y="${by}" fill="${NAVY}" font-size="14" font-weight="bold">先生からの一言</text>`;
  svg += `<rect x="40" y="${by + 10}" width="${W - 80}" height="120" rx="10" fill="#faf7ee" stroke="${GOLD}" stroke-opacity="0.5"/>`;
  const lines = wrapText(comment || "", 34).slice(0, 4);
  lines.forEach((ln, i) => {
    svg += `<text x="58" y="${by + 40 + i * 26}" fill="#374151" font-size="14">${esc(ln)}</text>`;
  });
  svg += `</svg>`;
  return svg;
}

// ざっくり折り返し（全角想定・maxは全角文字数の目安）
function wrapText(text: string, max: number): string[] {
  const out: string[] = [];
  for (const para of text.split("\n")) {
    let line = "";
    for (const ch of para) {
      line += ch;
      if (line.length >= max) {
        out.push(line);
        line = "";
      }
    }
    out.push(line);
  }
  return out;
}
