"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import {
  DEFAULT_SECTIONS, FIELD_TYPE_LABELS, LINK_OPTIONS, newFieldKey, parseSections,
  type FieldType, type LinkKey, type QField, type QSection,
} from "@/lib/questionnaire";

const TEAL = "#0d9488";
const CHOICE = (t: FieldType) => t === "radio" || t === "checkbox";

// 問診票の質問を管理画面で編集するエディタ。settings.questionnaire_schema に保存。
export default function IntakeSchemaEditor() {
  const supabase = useMemo(() => createClient(), []);
  const [secs, setSecs] = useState<QSection[]>(DEFAULT_SECTIONS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await supabase.from("settings").select("questionnaire_schema").eq("id", 1).maybeSingle();
        setSecs(parseSections((data as { questionnaire_schema?: unknown } | null)?.questionnaire_schema));
      } catch { setSecs(DEFAULT_SECTIONS); }
      setLoading(false);
    })();
  }, [supabase]);

  // 不変更新ヘルパー
  const mut = (fn: (draft: QSection[]) => QSection[]) => { setSecs((cur) => fn(cur.map((s) => ({ ...s, fields: s.fields.map((f) => ({ ...f })) })))); setDirty(true); setMsg(null); };
  const setSec = (si: number, patch: Partial<QSection>) => mut((d) => { d[si] = { ...d[si], ...patch }; return d; });
  const setField = (si: number, fi: number, patch: Partial<QField>) => mut((d) => { d[si].fields[fi] = { ...d[si].fields[fi], ...patch }; return d; });

  const moveSec = (si: number, dir: -1 | 1) => mut((d) => { const j = si + dir; if (j < 0 || j >= d.length) return d; [d[si], d[j]] = [d[j], d[si]]; return d; });
  const delSec = (si: number) => { if (!confirm("このセクションを丸ごと削除しますか？")) return; mut((d) => d.filter((_, i) => i !== si)); };
  const addSec = () => mut((d) => [...d, { title: "新しいセクション", fields: [] }]);

  const moveField = (si: number, fi: number, dir: -1 | 1) => mut((d) => { const f = d[si].fields; const j = fi + dir; if (j < 0 || j >= f.length) return d; [f[fi], f[j]] = [f[j], f[fi]]; return d; });
  const delField = (si: number, fi: number) => { if (!confirm("この質問を削除しますか？")) return; mut((d) => { d[si].fields = d[si].fields.filter((_, i) => i !== fi); return d; }); };
  const addField = (si: number) => mut((d) => { d[si].fields = [...d[si].fields, { key: newFieldKey(), label: "新しい質問", type: "text" }]; return d; });

  const changeType = (si: number, fi: number, type: FieldType) => mut((d) => {
    const f = { ...d[si].fields[fi], type };
    if (CHOICE(type) && !f.options) f.options = ["選択肢1", "選択肢2"];
    if (!CHOICE(type)) { delete f.options; delete f.other; }
    d[si].fields[fi] = f;
    return d;
  });

  async function save() {
    setSaving(true); setMsg(null);
    // 正規化（空セクション名や空質問はそのまま許容。キーの重複だけ解消）
    const clean = parseSections(secs);
    const { error } = await supabase.from("settings").update({ questionnaire_schema: clean }).eq("id", 1);
    setSaving(false);
    if (error) { setMsg("保存に失敗しました。settings に questionnaire_schema 列が必要です（migration_intake_schema.sql を実行してください）"); return; }
    setSecs(clean); setDirty(false); setMsg("保存しました。公開フォーム・カルテ・一覧に反映されます。");
  }

  function resetDefault() {
    if (!confirm("編集内容を破棄し、初期の問診票に戻しますか？（保存するまでDBは変わりません）")) return;
    setSecs(DEFAULT_SECTIONS.map((s) => ({ ...s, fields: s.fields.map((f) => ({ ...f })) })));
    setDirty(true); setMsg(null);
  }

  if (loading) return <div className="flex h-40 items-center justify-center text-sm text-slate-400">読み込み中…</div>;

  const totalFields = secs.reduce((n, s) => n + s.fields.length, 0);

  return (
    <div className="mx-auto max-w-3xl pb-28">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href="/admin/intake" className="rounded-md bg-slate-600 px-2 py-1 text-[11px] font-bold text-white active:bg-slate-700">← 一覧へ</Link>
        <h1 className="text-lg font-bold text-slate-800">問診票の質問を編集</h1>
        <span className="text-xs text-slate-400">{secs.length}セクション / {totalFields}問</span>
      </div>

      <p className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-xs leading-relaxed text-slate-500">
        ここで編集した質問は、患者さんが入力する問診票・カルテの初診時ページ・提出一覧すべてに反映されます。<br />
        「カルテ連携」を設定した質問の回答は、カルテ初診時の上部サマリ（競技／週何回／症状部位／いつから／既往）に自動で表示されます。
      </p>

      <div className="space-y-4">
        {secs.map((sec, si) => (
          <section key={si} className="rounded-xl border bg-white">
            {/* セクション見出し */}
            <div className="flex flex-wrap items-center gap-2 border-b bg-slate-50 px-3 py-2">
              <span className="text-[11px] font-bold text-slate-400">セクション{si + 1}</span>
              <input
                value={sec.title}
                onChange={(e) => setSec(si, { title: e.target.value })}
                placeholder="セクション名"
                className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm font-bold"
              />
              <div className="flex items-center gap-1">
                <button onClick={() => moveSec(si, -1)} disabled={si === 0} className="rounded border px-1.5 py-0.5 text-xs text-slate-500 disabled:opacity-30">↑</button>
                <button onClick={() => moveSec(si, 1)} disabled={si === secs.length - 1} className="rounded border px-1.5 py-0.5 text-xs text-slate-500 disabled:opacity-30">↓</button>
                <button onClick={() => delSec(si)} className="rounded border border-rose-200 px-1.5 py-0.5 text-xs font-bold text-rose-500">削除</button>
              </div>
            </div>

            {/* セクションの説明（任意・料金案内など） */}
            <div className="border-b px-3 py-2">
              <input
                value={sec.note ?? ""}
                onChange={(e) => setSec(si, { note: e.target.value || undefined })}
                placeholder="（任意）セクション上部に表示する注記・案内文"
                className="w-full rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600"
              />
            </div>

            {/* 質問 */}
            <div className="space-y-2 p-3">
              {sec.fields.map((f, fi) => (
                <div key={f.key} className="rounded-lg border border-slate-200 p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <input
                      value={f.label}
                      onChange={(e) => setField(si, fi, { label: e.target.value })}
                      placeholder="質問文"
                      className="min-w-0 flex-1 basis-full rounded-md border border-slate-300 px-2 py-1 text-sm sm:basis-0"
                    />
                    <select
                      value={f.type}
                      onChange={(e) => changeType(si, fi, e.target.value as FieldType)}
                      className="rounded-md border border-slate-300 bg-white px-1.5 py-1 text-xs"
                    >
                      {FIELD_TYPE_LABELS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <div className="flex items-center gap-1">
                      <button onClick={() => moveField(si, fi, -1)} disabled={fi === 0} className="rounded border px-1.5 py-0.5 text-xs text-slate-500 disabled:opacity-30">↑</button>
                      <button onClick={() => moveField(si, fi, 1)} disabled={fi === sec.fields.length - 1} className="rounded border px-1.5 py-0.5 text-xs text-slate-500 disabled:opacity-30">↓</button>
                      <button onClick={() => delField(si, fi)} className="rounded border border-rose-200 px-1.5 py-0.5 text-xs font-bold text-rose-500">✕</button>
                    </div>
                  </div>

                  {/* 選択肢（radio/checkbox） */}
                  {CHOICE(f.type) && (
                    <div className="mt-2">
                      <label className="mb-0.5 block text-[11px] font-bold text-slate-400">選択肢（1行に1つ）</label>
                      <textarea
                        value={(f.options ?? []).join("\n")}
                        onChange={(e) => setField(si, fi, { options: e.target.value.split("\n") })}
                        onBlur={(e) => setField(si, fi, { options: e.target.value.split("\n").map((x) => x.trim()).filter(Boolean) })}
                        rows={Math.max(2, (f.options ?? []).length)}
                        className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm"
                      />
                      <label className="mt-1 flex items-center gap-1.5 text-xs text-slate-600">
                        <input type="checkbox" checked={!!f.other} onChange={(e) => setField(si, fi, { other: e.target.checked || undefined })} style={{ accentColor: TEAL }} />
                        「その他（自由入力）」欄をつける
                      </label>
                    </div>
                  )}

                  {/* プレースホルダ（記述系） */}
                  {(f.type === "text" || f.type === "textarea" || f.type === "tel") && (
                    <input
                      value={f.placeholder ?? ""}
                      onChange={(e) => setField(si, fi, { placeholder: e.target.value || undefined })}
                      placeholder="（任意）入力例・ヒント"
                      className="mt-2 w-full rounded-md border border-slate-200 px-2 py-1 text-xs text-slate-600"
                    />
                  )}

                  {/* 必須・カルテ連携 */}
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                      <input type="checkbox" checked={!!f.required} onChange={(e) => setField(si, fi, { required: e.target.checked || undefined })} style={{ accentColor: TEAL }} />
                      必須
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-slate-500">
                      カルテ連携
                      <select
                        value={f.link ?? ""}
                        onChange={(e) => setField(si, fi, { link: (e.target.value || undefined) as LinkKey | undefined })}
                        className="rounded-md border border-slate-300 bg-white px-1.5 py-0.5 text-xs"
                      >
                        {LINK_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </label>
                  </div>
                </div>
              ))}

              <button onClick={() => addField(si)} className="w-full rounded-lg border border-dashed border-teal-300 py-1.5 text-xs font-bold text-teal-600 active:bg-teal-50">＋ 質問を追加</button>
            </div>
          </section>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={addSec} className="rounded-lg border border-dashed border-slate-300 px-4 py-2 text-sm font-bold text-slate-500 active:bg-slate-50">＋ セクションを追加</button>
        <button onClick={resetDefault} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-500 active:bg-slate-50">初期状態に戻す</button>
      </div>

      {/* 下部固定バー：保存／プレビュー */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t bg-white/95 px-4 py-3 backdrop-blur md:pl-64">
        <div className="mx-auto flex max-w-3xl items-center gap-2">
          {msg && <span className={`min-w-0 flex-1 truncate text-xs font-bold ${msg.includes("失敗") ? "text-rose-600" : "text-teal-700"}`}>{msg}</span>}
          {!msg && <span className="min-w-0 flex-1 text-xs text-slate-400">{dirty ? "未保存の変更があります" : "変更なし"}</span>}
          <a href="/intake?preview=1" target="_blank" rel="noreferrer" className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 active:bg-slate-50">👁 プレビュー</a>
          <button onClick={save} disabled={saving || !dirty} className="rounded-lg px-6 py-2 text-sm font-bold text-white disabled:opacity-40" style={{ backgroundColor: TEAL }}>{saving ? "保存中…" : "保存する"}</button>
        </div>
      </div>
    </div>
  );
}
