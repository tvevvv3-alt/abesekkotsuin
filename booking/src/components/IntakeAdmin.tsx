"use client";

import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { DEFAULT_SECTIONS, parseSections, type QSection, type QValue } from "@/lib/questionnaire";
import { ageAt } from "@/lib/pricing";

const normName = (s: string | null | undefined) => (s || "").replace(/[\s　]/g, "").trim();

type Row = {
  patient_id: string;
  submitted_at: string | null;
  reviewed_at: string | null;
  questionnaire: QValue;
  name: string;
  kana: string | null;
  birth: string | null;
};

// 回答を読みやすい文字列に
function fmtAnswer(v: QValue, key: string): string {
  const val = v[key];
  let s = Array.isArray(val) ? val.join("、") : typeof val === "string" ? val : "";
  const other = v[key + "__other"];
  if (typeof other === "string" && other.trim()) s = s ? `${s}（${other}）` : `その他（${other}）`;
  return s || "—";
}

// 印刷ヘッダのテーブルセル（A4）
const phThCell: CSSProperties = { border: "0.5pt solid #999", background: "#f1f5f9", padding: "3px 6px", fontSize: "9pt", fontWeight: 700, textAlign: "left", whiteSpace: "nowrap", width: "1%", color: "#334155" };
const phTdCell: CSSProperties = { border: "0.5pt solid #999", padding: "3px 8px" };

export default function IntakeAdmin() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "new">("all");
  const [q, setQ] = useState("");
  const [linkCopied, setLinkCopied] = useState(false);
  const [sections, setSections] = useState<QSection[]>(DEFAULT_SECTIONS);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from("settings").select("questionnaire_schema").eq("id", 1).maybeSingle();
        setSections(parseSections((data as { questionnaire_schema?: unknown } | null)?.questionnaire_schema));
      } catch { /* 未マイグレーションなら既定 */ }
    })();
  }, [supabase]);

  const load = useCallback(async () => {
    setLoading(true);
    const sel1 = "patient_id, submitted_at, reviewed_at, questionnaire, patients(name, name_kana, birth_date)";
    const sel2 = "patient_id, submitted_at, questionnaire, patients(name, name_kana, birth_date)";
    let data: Record<string, unknown>[] | null = null;
    const full = await supabase.from("patient_intake").select(sel1).order("submitted_at", { ascending: false, nullsFirst: false });
    if (full.error) {
      const base = await supabase.from("patient_intake").select(sel2).order("submitted_at", { ascending: false, nullsFirst: false });
      data = (base.data as Record<string, unknown>[] | null) ?? [];
    } else {
      data = (full.data as Record<string, unknown>[] | null) ?? [];
    }
    const rs: Row[] = data.map((r) => {
      const p = (r.patients || {}) as { name?: string; name_kana?: string | null; birth_date?: string | null };
      const qn = r.questionnaire;
      return {
        patient_id: r.patient_id as string,
        submitted_at: (r.submitted_at as string) ?? null,
        reviewed_at: (r.reviewed_at as string) ?? null,
        questionnaire: qn && typeof qn === "object" ? (qn as QValue) : {},
        name: p.name ?? "（不明）",
        kana: p.name_kana ?? null,
        birth: p.birth_date ?? null,
      };
    }).filter((r) => r.submitted_at || Object.keys(r.questionnaire).length > 0);
    setRows(rs);
    setLoading(false);
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  const shown = useMemo(() => {
    const key = normName(q);
    return rows.filter((r) => {
      if (filter === "new" && r.reviewed_at) return false;
      if (!key) return true;
      return normName(r.name).includes(key) || normName(r.kana).includes(key);
    });
  }, [rows, filter, q]);

  const current = useMemo(() => rows.find((r) => r.patient_id === sel) ?? null, [rows, sel]);

  async function toggleReviewed(r: Row) {
    const next = r.reviewed_at ? null : new Date().toISOString();
    const { error } = await supabase.from("patient_intake").update({ reviewed_at: next }).eq("patient_id", r.patient_id);
    if (error) { alert("「確認済み」の保存には reviewed_at 列の追加が必要です（migration_patient_intake_reviewed.sql）"); return; }
    setRows((rs) => rs.map((x) => (x.patient_id === r.patient_id ? { ...x, reviewed_at: next } : x)));
  }

  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mx-auto max-w-5xl">
      <style>{`
        .print-head { display: none; }
        @media print {
          @page { size: A4 portrait; margin: 12mm 13mm; }
          html, body { background: #fff !important; }
          .noprint { display: none !important; }
          /* 印刷対象だけを通常フローで全幅表示（枠線・余白・影をリセット） */
          .print-area { position: static !important; width: 100% !important; border: 0 !important; border-radius: 0 !important; padding: 0 !important; box-shadow: none !important; font-size: 10.5pt; color: #111; }
          .print-area, .print-area * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print-head { display: block !important; }
          .print-head table { font-size: 8.8pt; margin-bottom: 6px !important; }
          .print-head table td, .print-head table th { padding: 2px 6px !important; }
          .screen-head { display: none !important; }
          /* 1ページに収めるため2段組み＋コンパクト表示 */
          .print-area { font-size: 8.8pt; line-height: 1.25; }
          .q-list { column-count: 2; column-gap: 8mm; }
          .q-sec { break-inside: avoid; margin: 0 0 4px; }
          .q-sec h3 { font-size: 9.2pt; margin-bottom: 1px; padding-bottom: 1px; }
          .q-item { display: block !important; break-inside: avoid; border: 0 !important; padding: 0.5px 0 !important; }
          .q-item dt { display: inline; font-weight: 700; color: #111 !important; }
          .q-item dt::after { content: "："; }
          .q-item dd { display: inline; }
        }
      `}</style>

      <div className="noprint mb-3 flex flex-wrap items-center gap-2">
        <Link href="/admin" className="rounded-md bg-slate-600 px-2 py-1 text-[11px] font-bold text-white active:bg-slate-700">← 戻る</Link>
        <h1 className="text-lg font-bold text-slate-800">問診票（提出一覧）</h1>
        <span className="text-xs text-slate-400">{rows.length}件</span>
        <button
          onClick={async () => {
            const url = `${window.location.origin}/intake?new=1`;
            try { await navigator.clipboard.writeText(url); } catch { /* noop */ }
            setLinkCopied(true); setTimeout(() => setLinkCopied(false), 1800);
          }}
          title="白紙の問診票リンク（電話予約など、自動送信できない方に手動で送る用）"
          className="ml-auto rounded-md border border-slate-300 bg-white px-3 py-1 text-[11px] font-bold text-slate-600 active:bg-slate-100"
        >
          {linkCopied ? "✓ コピーしました" : "🔗 白紙リンクをコピー"}
        </button>
        <Link href="/admin/intake/edit" className="rounded-md border border-teal-300 bg-teal-50 px-3 py-1 text-[11px] font-bold text-teal-700 active:bg-teal-100">✏️ 質問を編集</Link>
      </div>

      <div className="flex gap-3">
        {/* 左：一覧（個別） */}
        <aside className={`noprint ${sel ? "hidden md:block" : "block"} w-full shrink-0 md:w-64`}>
          <div className="rounded-xl border bg-white">
            <div className="p-2">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="患者名・かなで検索" className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-sm" />
            </div>
            <div className="flex gap-1 px-2 pb-2 text-xs font-bold">
              {([["all", "すべて"], ["new", "未確認"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setFilter(k)} className={`flex-1 rounded-md py-1.5 ${filter === k ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-500"}`}>{l}</button>
              ))}
            </div>
            <div className="max-h-[70vh] overflow-y-auto">
              {loading ? (
                <p className="py-10 text-center text-sm text-slate-400">読み込み中…</p>
              ) : shown.length === 0 ? (
                <p className="py-10 text-center text-sm text-slate-400">提出された問診票はありません</p>
              ) : (
                shown.map((r) => (
                  <button key={r.patient_id} onClick={() => setSel(r.patient_id)} className={`flex w-full items-center gap-2 border-b px-3 py-2.5 text-left ${r.patient_id === sel ? "bg-teal-50" : "active:bg-slate-50"}`}>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-bold text-slate-800">{r.name}</div>
                      <div className="text-[11px] text-slate-400">{r.submitted_at ? new Date(r.submitted_at).toLocaleString("ja-JP", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }) + " 送信" : "スタッフ入力"}</div>
                    </div>
                    {!r.reviewed_at && <span className="shrink-0 rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-bold text-rose-600">未確認</span>}
                  </button>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* 右：個別の内容（印刷対象） */}
        <main className={`${sel ? "block" : "hidden md:block"} min-w-0 flex-1`}>
          {!current ? (
            <div className="noprint flex h-40 items-center justify-center rounded-xl border bg-white text-sm text-slate-400">左の一覧から選んでください</div>
          ) : (
            <div className="rounded-xl border bg-white p-4 print-area">
              <button onClick={() => setSel(null)} className="noprint mb-2 text-sm font-bold text-teal-700 md:hidden">‹ 一覧へ</button>

              {/* 画面用ヘッダ */}
              <div className="screen-head mb-3 flex flex-wrap items-center gap-2 border-b pb-2">
                <h2 className="text-lg font-bold text-slate-800">{current.name}</h2>
                {ageAt(current.birth, today) != null && <span className="text-sm text-slate-500">{ageAt(current.birth, today)}歳</span>}
                {current.kana && <span className="text-xs text-slate-400">{current.kana}</span>}
                <span className="ml-auto text-xs text-slate-400">{current.submitted_at ? new Date(current.submitted_at).toLocaleString("ja-JP") + " 送信" : "スタッフ入力"}</span>
              </div>

              {/* 印刷用ヘッダ（A4タテ） */}
              <div className="print-head">
                <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", borderBottom: "2px solid #111", paddingBottom: "4px", marginBottom: "8px" }}>
                  <div style={{ fontSize: "15pt", fontWeight: 700 }}>問 診 票</div>
                  <div style={{ fontSize: "9pt", color: "#333", textAlign: "right" }}>阿部接骨院 / Total Recoverytation Abe</div>
                </div>
                <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: "10px", fontSize: "10pt" }}>
                  <tbody>
                    <tr>
                      <th style={phThCell}>フリガナ</th>
                      <td style={phTdCell} colSpan={3}>{current.kana || "　"}</td>
                    </tr>
                    <tr>
                      <th style={phThCell}>お名前</th>
                      <td style={{ ...phTdCell, fontSize: "13pt", fontWeight: 700 }} colSpan={3}>{current.name}</td>
                    </tr>
                    <tr>
                      <th style={phThCell}>生年月日</th>
                      <td style={phTdCell}>{current.birth || "—"}{ageAt(current.birth, today) != null ? `（${ageAt(current.birth, today)}歳）` : ""}</td>
                      <th style={phThCell}>電話番号</th>
                      <td style={phTdCell}>{fmtAnswer(current.questionnaire, "phone")}</td>
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
                <button onClick={() => toggleReviewed(current)} className={`rounded-lg px-4 py-2 text-sm font-bold ${current.reviewed_at ? "border border-slate-300 text-slate-500" : "bg-teal-600 text-white"}`}>{current.reviewed_at ? "確認済み ✓（戻す）" : "確認済みにする"}</button>
                <Link href={`/admin/chart?p=${current.patient_id}`} className="rounded-lg border border-teal-300 bg-teal-50 px-4 py-2 text-sm font-bold text-teal-700">カルテを開く ›</Link>
              </div>

              <div className="q-list space-y-3">
                {sections.map((sec, si) => (
                  <section key={si} className="q-sec">
                    <h3 className="mb-1 border-b border-slate-300 pb-0.5 text-sm font-bold text-teal-700 print:text-black">{sec.title}</h3>
                    <dl>
                      {sec.fields.map((f) => (
                        <div key={f.key} className="q-item grid grid-cols-[8.5rem_1fr] gap-x-3 border-b border-slate-100 py-1 text-sm sm:grid-cols-[11rem_1fr]">
                          <dt className="font-bold text-slate-500 print:text-slate-700">{f.label}</dt>
                          <dd className="min-w-0 whitespace-pre-wrap break-words text-slate-800 print:text-black">{fmtAnswer(current.questionnaire, f.key)}</dd>
                        </div>
                      ))}
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
