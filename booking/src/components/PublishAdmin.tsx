"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadBookingWindows } from "@/lib/data";
import type { BookingWindow } from "@/lib/types";

// 月の公開状態を判定
export function windowState(w: BookingWindow | undefined, now = new Date()) {
  if (!w) return { open: false, label: "未設定" };
  if (w.published) return { open: true, label: "公開中" };
  if (w.open_at && new Date(w.open_at) <= now) return { open: true, label: "公開中" };
  if (w.open_at) return { open: false, label: "公開予定" };
  return { open: false, label: "非公開" };
}

function ymLabel(ym: string) {
  const [y, m] = ym.split("-");
  return `${y}年${parseInt(m, 10)}月`;
}
function fmtDateTime(s: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export default function PublishAdmin() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<BookingWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<BookingWindow | "new" | null>(null);
  const [ym, setYm] = useState("");
  const [openAt, setOpenAt] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [published, setPublished] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setRows(await loadBookingWindows(supabase));
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    reload();
  }, [reload]);

  function open(w: BookingWindow | "new") {
    setEditing(w);
    if (w === "new") {
      const d = new Date();
      const nextM = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const nym = `${nextM.getFullYear()}-${String(nextM.getMonth() + 1).padStart(2, "0")}`;
      setYm(nym);
      setOpenAt("");
      setFrom(`${nym}-01`);
      const last = new Date(nextM.getFullYear(), nextM.getMonth() + 1, 0);
      setTo(`${nym}-${String(last.getDate()).padStart(2, "0")}`);
      setPublished(false);
    } else {
      setYm(w.year_month);
      setOpenAt(w.open_at ? w.open_at.slice(0, 16) : "");
      setFrom(w.accept_from || "");
      setTo(w.accept_to || "");
      setPublished(w.published);
    }
  }

  async function save() {
    if (!/^\d{4}-\d{2}$/.test(ym)) return;
    setBusy(true);
    await supabase.from("booking_windows").upsert({
      year_month: ym,
      open_at: openAt ? new Date(openAt).toISOString() : null,
      accept_from: from || null,
      accept_to: to || null,
      published,
      updated_at: new Date().toISOString(),
    });
    setBusy(false);
    setEditing(null);
    reload();
  }

  async function quick(w: BookingWindow, patch: Partial<BookingWindow>) {
    await supabase.from("booking_windows").update(patch).eq("year_month", w.year_month);
    reload();
  }
  async function remove(w: BookingWindow) {
    if (!confirm(`${ymLabel(w.year_month)} の公開設定を削除しますか？`)) return;
    await supabase.from("booking_windows").delete().eq("year_month", w.year_month);
    reload();
  }

  return (
    <div className="max-w-2xl">
      <div className="mb-2 flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">予約公開設定</h1>
        <button onClick={() => open("new")} className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white">
          ＋ 月を追加
        </button>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        月ごとに公開日時・受付期間を設定します。公開前は患者側に予約枠を出さず「◯月分は◯月◯日◯時から受付開始予定です」と表示します。
      </p>

      {loading ? (
        <p className="text-sm text-slate-500">読み込み中…</p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-dashed bg-white p-6 text-center text-sm text-slate-400">
          設定がありません。未設定の月は「常に公開」として扱います（月を追加すると公開制御できます）。
        </p>
      ) : (
        <div className="space-y-2">
          {rows.map((w) => {
            const st = windowState(w);
            return (
              <div key={w.year_month} className="rounded-xl border bg-white p-3">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="font-bold text-slate-800">
                      {ymLabel(w.year_month)}{" "}
                      <span
                        className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-bold text-white ${
                          st.open ? "bg-green-600" : st.label === "公開予定" ? "bg-amber-500" : "bg-slate-400"
                        }`}
                      >
                        {st.label}
                      </span>
                    </div>
                    <div className="mt-1 text-xs text-slate-500">
                      公開日時：{fmtDateTime(w.open_at)}
                      <br />
                      受付期間：{w.accept_from || "—"} 〜 {w.accept_to || "—"}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                    <button onClick={() => open(w)} className="text-blue-600">編集</button>
                    {st.open ? (
                      <button onClick={() => quick(w, { published: false })} className="text-slate-500">
                        一時非公開
                      </button>
                    ) : (
                      <button onClick={() => quick(w, { published: true })} className="text-green-600">
                        今すぐ公開
                      </button>
                    )}
                    <button onClick={() => remove(w)} className="text-red-500">削除</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-2xl bg-white p-4 sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-slate-800">{editing === "new" ? "公開設定を追加" : "公開設定を編集"}</h2>
              <button onClick={() => setEditing(null)} className="text-slate-400">✕</button>
            </div>
            <label className="mb-2 block">
              <span className="mb-1 block text-xs text-slate-500">対象年月</span>
              <input
                type="month"
                value={ym}
                onChange={(e) => setYm(e.target.value)}
                disabled={editing !== "new"}
                className="w-full rounded-md border px-2 py-1.5 text-sm disabled:bg-slate-100"
              />
            </label>
            <label className="mb-2 block">
              <span className="mb-1 block text-xs text-slate-500">公開日時（この時刻から患者に表示）</span>
              <input type="datetime-local" value={openAt} onChange={(e) => setOpenAt(e.target.value)} className="w-full rounded-md border px-2 py-1.5 text-sm" />
            </label>
            <div className="mb-2 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">受付開始日</span>
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-full rounded-md border px-2 py-1.5 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">受付終了日</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-full rounded-md border px-2 py-1.5 text-sm" />
              </label>
            </div>
            <label className="mb-3 flex items-center gap-2 text-sm">
              <input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />
              今すぐ公開（公開日時を待たずに公開）
            </label>
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
