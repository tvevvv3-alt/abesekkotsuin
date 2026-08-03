"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { toDateStr } from "@/lib/booking";
import {
  buildEvalSvg,
  EMPTY_SCORES,
  EVAL_CATS,
  EVAL_MAX,
  evalTotal,
  fmtEvalDate,
  type EvalKey,
  type EvalScores,
} from "@/lib/eval";

interface EvalRow {
  id: string;
  name: string;
  eval_date: string;
  operation: number | null;
  balance: number | null;
  handstand: number | null;
  ring: number | null;
  boxjump: number | null;
  comment: string | null;
  line_sent_at: string | null;
}

function rowScores(r: EvalRow): EvalScores {
  return { operation: r.operation, balance: r.balance, handstand: r.handstand, ring: r.ring, boxjump: r.boxjump };
}

// SVG文字列 → PNG DataURL（ブラウザのフォントで描画。日本語もOK）
function svgToPng(svg: string, scale = 2): Promise<string> {
  return new Promise((resolve, reject) => {
    const w = Number(svg.match(/width="(\d+)"/)?.[1] || 760);
    const h = Number(svg.match(/height="(\d+)"/)?.[1] || 900);
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = w * scale;
      canvas.height = h * scale;
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error("no ctx")); return; }
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("svg load failed")); };
    img.src = url;
  });
}

export default function CoreEvalBoard() {
  const supabase = useMemo(() => createClient(), []);
  const [names, setNames] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [history, setHistory] = useState<EvalRow[]>([]);
  const [loading, setLoading] = useState(false);

  // 入力中（今回）
  const [editingId, setEditingId] = useState<string | null>(null);
  const [date, setDate] = useState(() => toDateStr(new Date()));
  const [scores, setScores] = useState<EvalScores>({ ...EMPTY_SCORES });
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  // 名前候補（体幹会員＋評価履歴）
  useEffect(() => {
    (async () => {
      const [{ data: cm }, { data: ev }] = await Promise.all([
        supabase.from("class_members").select("name"),
        supabase.from("core_evaluations").select("name"),
      ]);
      const set = new Set<string>();
      (cm ?? []).forEach((x: { name: string }) => x.name && set.add(x.name));
      (ev ?? []).forEach((x: { name: string }) => x.name && set.add(x.name));
      setNames(Array.from(set).sort((a, b) => a.localeCompare(b, "ja")));
    })();
  }, [supabase]);

  const loadHistory = useCallback(async (nm: string) => {
    if (!nm.trim()) { setHistory([]); return; }
    setLoading(true);
    const { data } = await supabase
      .from("core_evaluations")
      .select("id, name, eval_date, operation, balance, handstand, ring, boxjump, comment, line_sent_at")
      .eq("name", nm.trim())
      .order("eval_date", { ascending: false });
    setHistory((data as EvalRow[]) ?? []);
    setLoading(false);
  }, [supabase]);

  function pickName(nm: string) {
    setName(nm);
    setEditingId(null);
    setDate(toDateStr(new Date()));
    setScores({ ...EMPTY_SCORES });
    setComment("");
    setMsg(null);
    loadHistory(nm);
  }

  // 既存の評価を「今回」欄に読み込んで編集
  function editExisting(r: EvalRow) {
    setEditingId(r.id);
    setDate(r.eval_date);
    setScores(rowScores(r));
    setComment(r.comment ?? "");
    setMsg(null);
  }

  // 前回＝入力中の日付より前で最新（編集中の行自身は除く）
  const prevRow = useMemo(() => {
    return history
      .filter((r) => r.id !== editingId && r.eval_date < date)
      .sort((a, b) => b.eval_date.localeCompare(a.eval_date))[0] || null;
  }, [history, editingId, date]);

  const svg = useMemo(
    () =>
      buildEvalSvg({
        name,
        date,
        curr: scores,
        prev: prevRow ? rowScores(prevRow) : null,
        prevDate: prevRow?.eval_date ?? null,
        comment,
      }),
    [name, date, scores, prevRow, comment]
  );

  async function save(): Promise<string | null> {
    if (!name.trim()) { setMsg("お名前を入力してください"); return null; }
    setSaving(true);
    setMsg(null);
    const payload = {
      name: name.trim(),
      eval_date: date,
      operation: scores.operation,
      balance: scores.balance,
      handstand: scores.handstand,
      ring: scores.ring,
      boxjump: scores.boxjump,
      comment: comment.trim() || null,
    };
    let id = editingId;
    if (id) {
      await supabase.from("core_evaluations").update(payload).eq("id", id);
    } else {
      const { data } = await supabase.from("core_evaluations").insert(payload).select("id").single();
      id = (data as { id: string } | null)?.id ?? null;
      setEditingId(id);
    }
    setSaving(false);
    setMsg("保存しました");
    await loadHistory(name);
    return id;
  }

  async function sendLine() {
    setSending(true);
    setMsg(null);
    const id = await save();
    try {
      const png = await svgToPng(svg, 2);
      const res = await fetch("/api/eval/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ evalId: id, name: name.trim(), pngBase64: png }),
      });
      const j = (await res.json()) as { ok: boolean; reason?: string; error?: string };
      if (j.ok) setMsg("LINEに画像を送信しました");
      else if (j.reason === "noline") setMsg("この方はLINE未連携のため送信できません（体幹教室の予約からLINE連携が必要です）");
      else if (j.reason === "notconfigured") setMsg("LINE送信が未設定です");
      else setMsg(`送信に失敗しました：${j.error || j.reason || "?"}`);
    } catch (e) {
      setMsg("画像の生成に失敗しました：" + (e instanceof Error ? e.message : "?"));
    }
    setSending(false);
    await loadHistory(name);
  }

  function setScore(key: EvalKey, v: number | null) {
    setScores((s) => ({ ...s, [key]: v }));
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800">体幹評価</h1>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">3ヶ月に1回</span>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {/* 左：入力 */}
        <div className="space-y-3">
          <div className="rounded-xl border bg-white p-3">
            <label className="mb-1 block text-xs font-bold text-slate-600">お名前</label>
            <input
              list="eval-names"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => loadHistory(name)}
              placeholder="会員名を選択／入力"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <datalist id="eval-names">
              {names.map((n) => <option key={n} value={n} />)}
            </datalist>
            <div className="mt-2 flex items-center gap-2">
              <label className="text-xs font-bold text-slate-600">評価日</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="rounded-lg border border-slate-300 px-2 py-1 text-sm" />
              {editingId && <span className="text-[11px] text-amber-600">既存の評価を編集中</span>}
            </div>
          </div>

          {/* 5項目スコア */}
          <div className="rounded-xl border bg-white p-3">
            <div className="mb-2 text-xs font-bold text-slate-600">項目評価（0〜7）</div>
            <div className="space-y-2.5">
              {EVAL_CATS.map((c) => {
                const val = scores[c.key];
                const lvl = val != null && val >= 1 && val <= EVAL_MAX ? c.levels[val - 1] : null;
                return (
                  <div key={c.key}>
                    <div className="mb-1 flex items-center gap-2">
                      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: c.color }} />
                      <span className="text-sm font-bold text-slate-700">{c.label}</span>
                      <span className="ml-auto text-[11px] text-slate-400">{c.desc}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      <button onClick={() => setScore(c.key, null)}
                        className={`h-7 w-9 rounded border text-[11px] font-bold ${val == null ? "border-slate-500 bg-slate-500 text-white" : "border-slate-300 text-slate-500"}`}>–</button>
                      {Array.from({ length: EVAL_MAX + 1 }).map((_, n) => (
                        <button key={n} onClick={() => setScore(c.key, n)}
                          className={`h-7 w-7 rounded border text-[12px] font-bold ${val === n ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-600"}`}
                          style={val === n ? { backgroundColor: c.color, borderColor: c.color } : undefined}>{n}</button>
                      ))}
                    </div>
                    {lvl && <div className="mt-0.5 text-[11px] text-slate-500">Lv{val}：{lvl}</div>}
                  </div>
                );
              })}
            </div>
            <div className="mt-2 flex items-center justify-between border-t pt-2 text-sm">
              <span className="font-bold text-slate-600">合計</span>
              <span className="font-bold text-slate-800">{evalTotal(scores)}</span>
            </div>
          </div>

          {/* 先生からの一言 */}
          <div className="rounded-xl border bg-white p-3">
            <label className="mb-1 block text-xs font-bold text-slate-600">先生からの一言</label>
            <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
              placeholder="成長したところ・次の目標など"
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
          </div>

          <div className="flex items-center gap-2">
            <button onClick={save} disabled={saving || sending}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-700 active:bg-slate-100 disabled:opacity-50">
              {saving ? "保存中…" : "保存"}
            </button>
            <button onClick={sendLine} disabled={saving || sending}
              className="ml-auto flex items-center gap-2 rounded-lg bg-[#06C755] px-4 py-2 text-sm font-bold text-white active:opacity-90 disabled:opacity-50">
              {sending ? "送信中…" : "💬 保存してLINEで送信"}
            </button>
          </div>
          {msg && <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">{msg}</div>}

          {/* 履歴 */}
          <div className="rounded-xl border bg-white p-3">
            <div className="mb-2 text-xs font-bold text-slate-600">評価履歴</div>
            {loading ? (
              <p className="py-3 text-center text-sm text-slate-400">読み込み中…</p>
            ) : history.length === 0 ? (
              <p className="py-3 text-center text-sm text-slate-400">まだ評価がありません。</p>
            ) : (
              <div className="space-y-1">
                {history.map((r) => (
                  <button key={r.id} onClick={() => editExisting(r)}
                    className={`flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-sm ${editingId === r.id ? "border-blue-400 bg-blue-50" : "border-slate-200 active:bg-slate-50"}`}>
                    <span className="font-bold text-slate-700">{fmtEvalDate(r.eval_date)}</span>
                    <span className="text-slate-500">合計 {evalTotal(rowScores(r))}</span>
                    {r.line_sent_at && <span className="ml-auto rounded bg-emerald-50 px-1.5 text-[10px] font-bold text-emerald-600">LINE送信済</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* 右：プレビュー */}
        <div>
          <div className="sticky top-3">
            <div className="mb-1 text-xs font-bold text-slate-500">プレビュー（この画像がLINEで届きます）</div>
            <div className="overflow-hidden rounded-xl border bg-white shadow-sm">
              {/* SVGをそのまま表示 */}
              <div dangerouslySetInnerHTML={{ __html: svg.replace('width="760"', 'width="100%"') }} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
