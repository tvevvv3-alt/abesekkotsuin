"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadEquipment } from "@/lib/data";
import type { Equipment } from "@/lib/types";

export default function EquipmentAdmin() {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Equipment | "new" | null>(null);
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState(1);
  const [visible, setVisible] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setItems(await loadEquipment(supabase));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    reload();
  }, [reload]);

  function open(e: Equipment | "new") {
    setEditing(e);
    setError(null);
    if (e === "new") {
      setName(""); setCapacity(1); setVisible(true); setNote("");
    } else {
      setName(e.name); setCapacity(e.capacity); setVisible(e.visible); setNote(e.note || "");
    }
  }

  async function save() {
    if (!name.trim()) { setError("機器名を入力してください"); return; }
    setBusy(true); setError(null);
    try {
      const payload = { name: name.trim(), capacity: Math.max(1, capacity), visible, note: note.trim() || null };
      if (editing === "new") {
        const { error } = await supabase.from("equipment").insert({ ...payload, sort_order: items.length + 1 });
        if (error) throw new Error(error.message);
      } else if (editing) {
        const { error } = await supabase.from("equipment").update(payload).eq("id", editing.id);
        if (error) throw new Error(error.message);
      }
      setEditing(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラー");
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(e: Equipment) {
    await supabase.from("equipment").update({ active: !e.active }).eq("id", e.id);
    reload();
  }

  if (loading) return <p className="py-8 text-center text-sm text-slate-500">読み込み中…</p>;

  return (
    <div className="max-w-2xl">
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">機器管理</h1>
        <button onClick={() => open("new")} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white">
          ＋ 機器を追加
        </button>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        「全身通電」は工程名で、使用する機器は「ハイチャージ」です。同時利用上限で予約人数を判定します。
      </p>

      <div className="space-y-2">
        {items.map((e) => (
          <div key={e.id} className={`flex items-center justify-between rounded-xl border bg-white p-3 ${e.active ? "" : "opacity-50"}`}>
            <div>
              <div className="font-bold text-slate-800">
                {e.name} <span className="text-xs font-normal text-slate-400">同時{e.capacity}名</span>
                {!e.visible && <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-500">非表示</span>}
              </div>
              {e.note && <div className="text-xs text-slate-500">{e.note}</div>}
            </div>
            <div className="flex items-center gap-3 text-sm">
              <button onClick={() => open(e)} className="text-blue-600">編集</button>
              <button onClick={() => toggleActive(e)} className="text-slate-500">{e.active ? "停止" : "再開"}</button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-2xl bg-white p-4 sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-slate-800">{editing === "new" ? "機器を追加" : "機器を編集"}</h2>
              <button onClick={() => setEditing(null)} className="text-slate-400">✕</button>
            </div>
            <label className="mb-2 block">
              <span className="mb-1 block text-xs font-medium text-slate-600">機器名</span>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="ハイチャージ" className="w-full rounded-md border px-2 py-1.5 text-sm" />
            </label>
            <label className="mb-2 block">
              <span className="mb-1 block text-xs font-medium text-slate-600">同時利用上限</span>
              <input type="number" min={1} value={capacity} onChange={(e) => setCapacity(parseInt(e.target.value || "1", 10))} className="w-24 rounded-md border px-2 py-1.5 text-sm" />
              <span className="ml-1 text-sm text-slate-500">名</span>
            </label>
            <label className="mb-2 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={visible} onChange={(e) => setVisible(e.target.checked)} />
              予約表・患者画面に表示
            </label>
            <label className="mb-3 block">
              <span className="mb-1 block text-xs font-medium text-slate-600">備考</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} className="w-full rounded-md border px-2 py-1.5 text-sm" />
            </label>
            {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
            <div className="flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-lg border px-4 py-2 text-sm text-slate-600">閉じる</button>
              <button onClick={save} disabled={busy} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white disabled:bg-slate-300">
                {busy ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
