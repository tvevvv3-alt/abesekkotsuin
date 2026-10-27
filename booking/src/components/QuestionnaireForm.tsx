"use client";

import { useEffect, useRef, useState } from "react";
import { Q_SECTIONS, type QField, type QSection, type QValue } from "@/lib/questionnaire";

// 和暦（元号＋年月日）入力。内部値は西暦 YYYY-MM-DD で保持し既存処理と互換。
const ERAS = [
  { key: "令和", base: 2018, max: new Date().getFullYear() - 2018 },
  { key: "平成", base: 1988, max: 31 },
  { key: "昭和", base: 1925, max: 64 },
  { key: "大正", base: 1911, max: 15 },
];
function waFromISO(s: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || "");
  if (!m) return { era: "", y: "", mo: "", d: "" };
  const Y = +m[1];
  for (const e of ERAS) if (Y > e.base) return { era: e.key, y: String(Y - e.base), mo: String(+m[2]), d: String(+m[3]) };
  return { era: "", y: "", mo: String(+m[2]), d: String(+m[3]) };
}
function waToISO(era: string, y: string, mo: string, d: string) {
  if (!era || !y || !mo || !d) return "";
  const e = ERAS.find((x) => x.key === era);
  if (!e) return "";
  const Y = e.base + parseInt(y, 10);
  return `${Y}-${String(parseInt(mo, 10)).padStart(2, "0")}-${String(parseInt(d, 10)).padStart(2, "0")}`;
}
function WarekiInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // 内部で元号/年/月/日を保持（未完成でも選択が消えないように）。確定時に西暦へ変換して親へ通知。
  const init = waFromISO(value);
  const [era, setEra] = useState(init.era);
  const [y, setY] = useState(init.y);
  const [mo, setMo] = useState(init.mo);
  const [d, setD] = useState(init.d);
  const lastEmit = useRef(value);
  // 親が外部から value を変えた（患者切替・プリフィル等）ときだけ内部を同期
  useEffect(() => {
    if (value !== lastEmit.current) {
      const p = waFromISO(value);
      setEra(p.era); setY(p.y); setMo(p.mo); setD(p.d);
      lastEmit.current = value;
    }
  }, [value]);
  const commit = (e: string, yy: string, m: string, dd: string) => {
    const iso = waToISO(e, yy, m, dd);
    lastEmit.current = iso;
    onChange(iso);
  };
  const setEraV = (v: string) => { setEra(v); setY(""); commit(v, "", mo, d); };
  const setYV = (v: string) => { setY(v); commit(era, v, mo, d); };
  const setMoV = (v: string) => { setMo(v); commit(era, y, v, d); };
  const setDV = (v: string) => { setD(v); commit(era, y, mo, v); };
  const eraObj = ERAS.find((e) => e.key === era);
  const years = eraObj ? Array.from({ length: Math.max(eraObj.max, 1) }, (_, i) => i + 1) : [];
  const iso = waToISO(era, y, mo, d);
  const sel = "rounded-lg border border-slate-300 bg-white px-2 py-2 text-sm";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <select value={era} onChange={(e) => setEraV(e.target.value)} className={sel}>
        <option value="">元号</option>
        {ERAS.map((e) => <option key={e.key} value={e.key}>{e.key}</option>)}
      </select>
      <select value={y} onChange={(e) => setYV(e.target.value)} disabled={!era} className={sel}>
        <option value="">—</option>
        {years.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <span className="text-sm text-slate-500">年</span>
      <select value={mo} onChange={(e) => setMoV(e.target.value)} className={sel}>
        <option value="">—</option>
        {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <span className="text-sm text-slate-500">月</span>
      <select value={d} onChange={(e) => setDV(e.target.value)} className={sel}>
        <option value="">—</option>
        {Array.from({ length: 31 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
      <span className="text-sm text-slate-500">日</span>
      {iso && <span className="ml-1 text-[11px] text-slate-400">（西暦 {iso.slice(0, 4)}年）</span>}
    </div>
  );
}

// スキーマ駆動の問診票フォーム。公開ページ・カルテ初診時で共用。
// sections を渡すと、その質問定義で描画（管理画面で編集した内容を反映）。
export default function QuestionnaireForm({
  value, onChange, accent = "#0d9488", sections = Q_SECTIONS,
}: {
  value: QValue;
  onChange: (next: QValue) => void;
  accent?: string;
  sections?: QSection[];
}) {
  const set = (k: string, v: string | string[]) => onChange({ ...value, [k]: v });
  const str = (k: string) => (typeof value[k] === "string" ? (value[k] as string) : "");
  const arr = (k: string) => (Array.isArray(value[k]) ? (value[k] as string[]) : []);

  const toggle = (k: string, opt: string) => {
    const cur = arr(k);
    set(k, cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt]);
  };

  const inputCls = "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none";
  const field = (f: QField) => {
    const req = f.required ? <span className="ml-0.5 text-rose-500">*</span> : null;
    return (
      <div key={f.key} className="mb-3">
        <label className="mb-1 block text-sm font-bold text-slate-700">{f.label}{req}</label>
        {(f.type === "text" || f.type === "tel" || f.type === "date") && (
          <input
            type={f.type === "tel" ? "tel" : f.type === "date" ? "date" : "text"}
            inputMode={f.type === "tel" ? "tel" : undefined}
            value={str(f.key)}
            placeholder={"placeholder" in f ? f.placeholder : undefined}
            onChange={(e) => set(f.key, e.target.value)}
            onFocus={(e) => (e.currentTarget.style.borderColor = accent)}
            onBlur={(e) => (e.currentTarget.style.borderColor = "")}
            className={inputCls}
          />
        )}
        {f.type === "wareki" && (
          <WarekiInput value={str(f.key)} onChange={(v) => set(f.key, v)} />
        )}
        {f.type === "textarea" && (
          <textarea
            value={str(f.key)}
            placeholder={"placeholder" in f ? f.placeholder : undefined}
            onChange={(e) => set(f.key, e.target.value)}
            rows={2}
            className={`${inputCls} resize-y`}
          />
        )}
        {f.type === "radio" && (
          <div className="space-y-1">
            {(f.options ?? []).map((o) => (
              <label key={o} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="radio" name={f.key} checked={str(f.key) === o} onChange={() => set(f.key, o)} style={{ accentColor: accent }} />
                {o}
              </label>
            ))}
            {f.other && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="radio" name={f.key} checked={str(f.key) === "その他"} onChange={() => set(f.key, "その他")} style={{ accentColor: accent }} />
                その他
                <input value={str(f.key + "__other")} onChange={(e) => set(f.key + "__other", e.target.value)} placeholder="内容" className="flex-1 rounded border border-slate-300 px-2 py-0.5 text-sm" />
              </label>
            )}
          </div>
        )}
        {f.type === "checkbox" && (
          <div className="space-y-1">
            {(f.options ?? []).map((o) => (
              <label key={o} className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={arr(f.key).includes(o)} onChange={() => toggle(f.key, o)} style={{ accentColor: accent }} />
                {o}
              </label>
            ))}
            {f.other && (
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input type="checkbox" checked={arr(f.key).includes("その他")} onChange={() => toggle(f.key, "その他")} style={{ accentColor: accent }} />
                その他
                <input value={str(f.key + "__other")} onChange={(e) => set(f.key + "__other", e.target.value)} placeholder="内容" className="flex-1 rounded border border-slate-300 px-2 py-0.5 text-sm" />
              </label>
            )}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {sections.map((sec, si) => (
        <section key={si} className="rounded-xl border bg-white p-3">
          <h3 className="mb-2 border-b pb-1.5 text-sm font-bold" style={{ color: accent }}>{sec.title}</h3>
          {sec.note && (
            <pre className="mb-3 whitespace-pre-wrap rounded-lg bg-slate-50 p-2 text-[11px] leading-relaxed text-slate-600">{sec.note}</pre>
          )}
          {sec.fields.map(field)}
        </section>
      ))}
    </div>
  );
}
