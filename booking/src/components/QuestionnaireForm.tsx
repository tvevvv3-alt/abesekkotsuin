"use client";

import { Q_SECTIONS, type QField, type QValue } from "@/lib/questionnaire";

// スキーマ駆動の問診票フォーム。公開ページ・カルテ初診時で共用。
export default function QuestionnaireForm({
  value, onChange, accent = "#0d9488",
}: {
  value: QValue;
  onChange: (next: QValue) => void;
  accent?: string;
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
            {f.options.map((o) => (
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
            {f.options.map((o) => (
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
      {Q_SECTIONS.map((sec) => (
        <section key={sec.title} className="rounded-xl border bg-white p-3">
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
