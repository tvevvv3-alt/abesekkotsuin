"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_APPLICATION_SECTIONS, appSections } from "@/lib/application";
import { type QSection, type QValue } from "@/lib/questionnaire";
import { ageAt } from "@/lib/pricing";

const normName = (s: string | null | undefined) => (s || "").replace(/[\s　]/g, "").trim();

type Row = {
  patient_id: string;
  submitted_at: string | null;
  answers: QValue;
  name: string;
  kana: string | null;
  birth: string | null;
};

function fmtAnswer(v: QValue, key: string): string {
  const val = v[key];
  let s = Array.isArray(val) ? val.join("、") : typeof val === "string" ? val : "";
  const other = v[key + "__other"];
  if (typeof other === "string" && other.trim()) s = s ? `${s}（${other}）` : `その他（${other}）`;
  return s || "—";
}

const WA_ERAS = [
  { key: "令和", base: 2018 }, { key: "平成", base: 1988 }, { key: "昭和", base: 1925 }, { key: "大正", base: 1911 },
];
function toWareki(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || "");
  if (!m) return iso || "—";
  const Y = +m[1], mo = +m[2], d = +m[3];
  for (const e of WA_ERAS) if (Y > e.base) return `${e.key}${Y - e.base}年${mo}月${d}日`;
  return `${Y}年${mo}月${d}日`;
}

const phThCell: CSSProperties = { border: "0.5pt solid #999", background: "#eef2ff", padding: "3px 6px", fontSize: "9pt", fontWeight: 700, textAlign: "left", whiteSpace: "nowrap", width: "1%", color: "#3730a3" };
const phTdCell: CSSProperties = { border: "0.5pt solid #999", padding: "3px 8px" };

export default function ApplicationAdmin() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [sections, setSections] = useState<QSection[]>(DEFAULT_APPLICATION_SECTIONS);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from("settings").select("application_schema").eq("id", 1).maybeSingle();
        setSections(appSections((data as { application_schema?: unknown } | null)?.application_schema));
      } catch { /* 未マイグレーションなら既定 */ }
    })();
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("patient_application")
      .select("patient_id, submitted_at, answers, patients(name, name_kana, birth_date)")
      .order("submitted_at", { ascending: false, nullsFirst: false });
    const rs: Row[] = ((data as Record<string, unknown>[] | null) ?? []).map((r) => {
      const p = (r.patients || {}) as { name?: string; name_kana?: string | null; birth_date?: string | null };
      const qn = r.answers;
      return {
        patient_id: r.patient_id as string,
        submitted_at: (r.submitted_at as string) ?? null,
        answers: qn && typeof qn === "object" ? (qn as QValue) : {},
        name: p.name ?? "（不明）",
        kana: p.name_kana ?? null,
        birth: p.birth_date ?? null,
      };
    }).filter((r) => r.submitted_at || Object.keys(r.answers).length > 0);
    setRows(rs);
    setLoading(false);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const key = normName(q);
    if (!key) return rows;
    return rows.filter((r) => normName(r.name).includes(key) || normName(r.kana).includes(key));
  }, [rows, q]);

  const current = useMemo(() => rows.find((r) => r.patient_id === sel) ?? null, [rows, sel]);
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-5xl">
      <style>{`
        .print-head { display: none; }
        @media print {
          @page { size: A4 portrait; margin: 12mm 13mm; }
          html, body { background: #fff !important; }
          .noprint { display: none !important; }
          .print-area { position: static !important; width: 100% !important; border: 0 !important; border-radius: 0 !important; padding: 0 !important; box-shadow: none !important; font-size: 9.3pt; color: #111; line-height: 1.3; }
          .print-area, .print-area * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-head { display: block !important; }
          .screen-head { display: none !important; }
          .q-sec { break-inside: avoid; margin: 0 0 7px; }
          .q-sec h3 { font-size: 9.8pt; margin-bottom: 3px; padding-bottom: 2px; border-bottom: 0.5pt solid #c7d2fe; }
          .q-item { break-inside: avoid; margin-bottom: 5px; }
          .q-item dt { font-weight: 700; color: #475569 !important; font-size: 8.5pt; }
          .q-item dd { color: #111 !important; padding-left: 9px; }
        }
      `}</style>

      <div className="noprint mb-3 flex flex-wrap items-center gap-2">
        <Link href="/admin" className="rounded-md bg-slate-600 px-2 py-1 text-[11px] font-bold text-white active:bg-slate-700">← 戻る</Link>
        <h1 className="text-lg font-bold text-slate-800">体幹教室 申込書（提出一覧）</h1>
        <span className="text-xs text-slate-400">{rows.length}件</span>
        <button
          onClick={async () => {
            const url = `${window.location.origin}/application?new=1`;
            try { await navigator.clipboard.writeText(url); } catch { /* noop */ }
            setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1800);
          }}
          title="白紙の申込書リンク（手動で送る用）"
          className="ml-auto rounded-md border border-slate-300 bg-white px-3 py-1 text-[11px] font-bold text-slate-600 active:bg-slate-100"
        >
          {linkCopied ? "✓ コピーしました" : "🔗 白紙リンクをコピー"}
        </button>
      </div>

      <div className="flex gap-3">
        <aside className={`noprint ${sel ? "hidden md:block" : "block"} w-full shrink-0 md:w-64`}>
          <div className="rounded-xl border bg-white">
            <div className="p-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="参加者名・かなで検索" className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {loading ? (
                <p className="py-10 text-center text-sm text-slate-400">読み込み中…</p>
              ) : shown.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">提出された申込書はありません</p>
              ) : (
                shown.map((r) => (
                  <button key={r.patient_id} onClick={() => setSel(r.patient_id)} className={`flex w-full items-center gap-2 border-b px-3 py-2.5 text-left ${r.patient_id === sel ? "bg-indigo-50" : "active:bg-slate-50"}`}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-slate-800">{r.name}</div>
                      <div className="text-[11px] text-slate-400">{r.submitted_at ? new Date(r.submitted_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) + " 送信" : "スタッフ入力"}</div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>

        <main className={`${sel ? "block" : "hidden md:block"} min-w-0 flex-1`}>
          {!current ? (
            <div className="noprint flex h-40 items-center justify-center rounded-xl border bg-white text-sm text-slate-400">左の一覧から選んでください</div>
          ) : (
            <div className="rounded-xl border bg-white p-4 print-area">
              <button onClick={() => setSel(null)} className="noprint mb-2 text-sm font-bold text-indigo-700 md:hidden">‹ 一覧へ</button>

              <div className="screen-head mb-3 flex flex-wrap items-center gap-2 border-b pb-2">
                <h2 className="text-lg font-bold text-slate-800">{current.name}</h2>
                {ageAt(current.birth, today) != null && <span className="text-sm text-slate-500">{ageAt(current.birth, today)}歳</span>}
                {current.kana && <span className="text-xs text-slate-400">{current.kana}</span>}
                <span className="ml-auto text-xs text-slate-400">{current.submitted_at ? new Date(current.submitted_at).toLocaleString("ja-JP") + " 送信" : "スタッフ入力"}</span>
              </div>

              <div className="print-head">
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", borderBottom: "2px solid #111", paddingBottom: "4px", marginBottom: "8px" }}>
                  <div style={{ fontSize: "14pt", fontWeight: 700 }}>体幹教室 申込書</div>
                  <div style={{ fontSize: "9pt", color: "#333", textAlign: "right" }}>阿部接骨院 / Total Recoverytation Abe</div>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "10px", fontSize: "10pt" }}>
                  <tbody>
                    <tr>
                      <th style={phThCell}>フリガナ</th>
                      <td style={phTdCell} colSpan={3}>{current.kana || "　"}</td>
                    </tr>
                    <tr>
                      <th style={phThCell}>参加者名</th>
                      <td style={{ ...phTdCell, fontSize: "13pt", fontWeight: 700 }} colSpan={3}>{current.name}</td>
                    </tr>
                    <tr>
                      <th style={phThCell}>生年月日</th>
                      <td style={phTdCell}>{current.birth ? toWareki(current.birth) : "—"}{ageAt(current.birth, today) != null ? `（${ageAt(current.birth, today)}歳）` : ""}</td>
                      <th style={phThCell}>電話番号</th>
                      <td style={phTdCell}>{fmtAnswer(current.answers, "phone")}</td>
                    </tr>
                    <tr>
                      <th style={phThCell}>提出日</th>
                      <td style={phTdCell} colSpan={3}>{current.submitted_at ? new Date(current.submitted_at).toLocaleString("ja-JP") + " 送信" : "スタッフ入力"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="noprint mb-3 flex flex-wrap gap-2">
                <button onClick={() => window.print()} className="rounded-lg bg-slate-700 px-4 py-2 text-sm font-bold text-white active:bg-slate-800">🖨 印刷</button>
              </div>

              <div className="space-y-3">
                {sections.map((sec, si) => (
                  <section key={si} className="q-sec">
                    <h3 className="mb-1 border-b border-indigo-200 pb-0.5 text-sm font-bold text-indigo-700 print:text-black">{sec.title}</h3>
                    {sec.note && <p className="mb-1 whitespace-pre-wrap text-[11px] text-slate-500">{sec.note}</p>}
                    <dl>
                      {sec.fields.map((f) => {
                        const disp = f.type === "wareki"
                          ? (typeof current.answers[f.key] === "string" && current.answers[f.key] ? toWareki(current.answers[f.key] as string) : "—")
                          : fmtAnswer(current.answers, f.key);
                        return (
                          <div key={f.key} className="q-item border-b border-slate-100 py-1.5 text-sm">
                            <dt className="text-[13px] font-bold text-slate-500 print:text-slate-700">{f.label}</dt>
                            <dd className="mt-0.5 min-w-0 whitespace-pre-wrap break-words pl-2 font-medium text-slate-800 print:text-black">{disp}</dd>
                          </div>
                        );
                      })}
                    </dl>
                  </section>
                ))}
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
