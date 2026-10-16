"use client";

import { useEffect, useState } from "react";
import QuestionnaireForm from "@/components/QuestionnaireForm";
import { DEFAULT_SECTIONS, missingRequired, parseSections, type QSection, type QValue } from "@/lib/questionnaire";

const TEAL = "#0d9488";

export default function IntakePage() {
  const [apptId, setApptId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<QValue>({});
  const [sections, setSections] = useState<QSection[]>(DEFAULT_SECTIONS);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [preview, setPreview] = useState(false);
  const [blank, setBlank] = useState(false); // 白紙モード（予約に紐づかない直接入力・電話予約用）

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    const a = sp.get("a");
    setApptId(a);
    const isPreview = sp.get("preview") === "1";
    const isBlank = sp.get("new") === "1" || sp.get("blank") === "1";
    if (isPreview) setPreview(true);
    if (isBlank) setBlank(true);
    if (!a && !isPreview && !isBlank) { setLoading(false); setErr("予約が指定されていません。LINEのリンクから開いてください。"); return; }
    (async () => {
      try {
        const res = await fetch(`/api/intake${a ? `?a=${encodeURIComponent(a)}` : ""}`);
        const j = await res.json();
        if (!j.ok) { setErr("予約が見つかりませんでした。"); setLoading(false); return; }
        if (j.schema) setSections(parseSections(j.schema));
        // 既存回答があれば復元、無ければ予約・患者情報で基本項目をプリフィル
        const base: QValue = { ...(j.answers || {}) };
        if (!base.name && j.patient?.name) base.name = j.patient.name;
        if (!base.kana && j.patient?.kana) base.kana = j.patient.kana;
        if (!base.birth && j.patient?.birth) base.birth = j.patient.birth;
        if (!base.phone && j.patient?.phone) base.phone = j.patient.phone;
        setAnswers(base);
      } catch {
        setErr("読み込みに失敗しました。");
      }
      setLoading(false);
    })();
  }, []);

  async function submit() {
    const miss = missingRequired(answers, sections);
    if (miss.length) { setErr(`未入力の必須項目があります：${miss.slice(0, 5).join("、")}${miss.length > 5 ? " ほか" : ""}`); window.scrollTo({ top: 0, behavior: "smooth" }); return; }
    setBusy(true);
    setErr(null);
    try {
      const res = await fetch("/api/intake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apptId ? { appointmentId: apptId, answers } : { answers, blank: true }),
      });
      const j = await res.json();
      if (j.ok) setDone(true);
      else if (j.reason === "noname") setErr("お名前の入力が必要です。");
      else setErr("送信に失敗しました。時間をおいて再度お試しください。");
    } catch {
      setErr("送信に失敗しました。通信環境をご確認ください。");
    }
    setBusy(false);
  }

  if (loading) return <div className="flex min-h-[60vh] items-center justify-center text-sm text-slate-400">読み込み中…</div>;

  if (done) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full" style={{ backgroundColor: "#06C75522" }}>
          <span className="text-2xl" style={{ color: "#06C755" }}>✓</span>
        </div>
        <h1 className="mb-2 text-lg font-bold text-slate-800">送信が完了しました</h1>
        <p className="text-sm text-slate-500">ご記入ありがとうございました。<br />ご来院をお待ちしております。</p>
        <p className="mt-6 text-xs text-slate-400">阿部接骨院 / Total Recoverytation Abe</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 py-5">
      <div className="mb-3">
        <h1 className="text-xl font-bold text-slate-800">問診票</h1>
        <p className="text-xs text-slate-500">ご来院前に、下記のご記入をお願いいたします。</p>
      </div>
      {preview && <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold text-amber-700">プレビュー表示です（送信はされません）。実際は患者さんが予約ごとのリンクから入力します。</p>}
      {err && <p className="mb-3 rounded-lg bg-rose-50 px-3 py-2 text-sm font-bold text-rose-600">{err}</p>}
      {(apptId || preview || blank) && <QuestionnaireForm value={answers} onChange={setAnswers} accent={TEAL} sections={sections} />}
      {(apptId || blank) && !preview && (
        <div className="sticky bottom-0 -mx-4 mt-4 border-t bg-white/95 px-4 py-3 backdrop-blur">
          <button
            onClick={submit}
            disabled={busy}
            className="w-full rounded-xl py-3 text-base font-bold text-white disabled:opacity-50"
            style={{ backgroundColor: TEAL }}
          >
            {busy ? "送信中…" : "送信する"}
          </button>
        </div>
      )}
    </div>
  );
}
