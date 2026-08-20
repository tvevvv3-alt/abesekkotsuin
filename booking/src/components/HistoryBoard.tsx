"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

interface Log {
  id: string;
  appointment_id: string | null;
  action: "created" | "moved" | "cancelled" | string;
  patient_name: string | null;
  detail: string | null;
  created_at: string;
}

const META: Record<string, { label: string; cls: string }> = {
  created: { label: "予約", cls: "bg-blue-100 text-blue-700" },
  moved: { label: "変更", cls: "bg-amber-100 text-amber-700" },
  cancelled: { label: "キャンセル", cls: "bg-red-100 text-red-600" },
};

export default function HistoryBoard() {
  const supabase = useMemo(() => createClient(), []);
  const [logs, setLogs] = useState<Log[]>([]);
  const [appts, setAppts] = useState<Map<string, { service_name: string | null; staff_id: string | null }>>(new Map());
  const [staff, setStaff] = useState<Map<string, { name: string; color: string | null }>>(new Map());
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "moved" | "cancelled">("all");

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: logRows }, { data: staffRows }] = await Promise.all([
      supabase
        .from("appointment_logs")
        .select("id, appointment_id, action, patient_name, detail, created_at")
        .order("created_at", { ascending: false })
        .limit(300),
      supabase.from("staff").select("id, name, color"),
    ]);
    const ls = (logRows as Log[]) ?? [];
    setLogs(ls);
    setStaff(new Map((staffRows ?? []).map((s) => [s.id as string, { name: s.name as string, color: (s.color as string) ?? null }])));
    // メニュー名・担当色を出すため、対象予約をまとめて取得
    const ids = Array.from(new Set(ls.map((l) => l.appointment_id).filter((x): x is string => !!x)));
    if (ids.length) {
      const { data: apRows } = await supabase.from("appointments").select("id, service_name, staff_id").in("id", ids);
      setAppts(new Map((apRows ?? []).map((a) => [a.id as string, { service_name: (a.service_name as string) ?? null, staff_id: (a.staff_id as string) ?? null }])));
    } else {
      setAppts(new Map());
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  const shown = useMemo(
    () => (filter === "all" ? logs : logs.filter((l) => l.action === filter)),
    [logs, filter]
  );

  const fmt = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href="/admin" className="shrink-0 rounded-md bg-slate-600 px-2 py-1 text-[11px] font-bold text-white active:bg-slate-700">← 予約一覧</Link>
        <h1 className="text-lg font-bold text-slate-800">予約履歴</h1>
        <button onClick={load} disabled={loading}
          className="shrink-0 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 active:bg-slate-100 disabled:opacity-50">
          {loading ? "更新中…" : "🔄 更新"}
        </button>
        <div className="ml-auto inline-flex rounded-md border border-slate-300 bg-white p-0.5 text-[11px] font-bold">
          {(["all", "moved", "cancelled"] as const).map((f) => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded px-2 py-1 ${filter === f ? "bg-blue-600 text-white" : "text-slate-600"}`}>
              {f === "all" ? "すべて" : f === "moved" ? "変更" : "キャンセル"}
            </button>
          ))}
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border bg-white">
        {loading ? (
          <div className="px-3 py-10 text-center text-sm text-slate-400">読み込み中…</div>
        ) : shown.length === 0 ? (
          <div className="px-3 py-10 text-center text-sm text-slate-400">履歴はまだありません。</div>
        ) : (
          <ul className="divide-y">
            {shown.map((l) => {
              const m = META[l.action] ?? { label: l.action, cls: "bg-slate-100 text-slate-600" };
              const ap = l.appointment_id ? appts.get(l.appointment_id) : null;
              const st = ap?.staff_id ? staff.get(ap.staff_id) : null;
              const menu = ap?.service_name || null;
              // 「… / 担当名」で終わる detail は担当名を分離して色付け表示にする
              let detailText = l.detail || "";
              let staffName: string | null = null;
              if (st && detailText.endsWith(` / ${st.name}`)) {
                staffName = st.name;
                detailText = detailText.slice(0, detailText.length - ` / ${st.name}`.length);
              }
              return (
                <li key={l.id} className="flex items-center gap-2 px-3 py-2">
                  <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-bold ${m.cls}`}>{m.label}</span>
                  <span className="shrink-0 text-sm font-bold text-slate-800">{l.patient_name || "（未登録）"}</span>
                  <span className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-[12px] text-slate-500">
                    <span className="truncate">{detailText}</span>
                    {staffName && (
                      <span className="shrink-0 font-bold" style={{ color: st?.color || "#334155" }}>/ {staffName}</span>
                    )}
                    {menu && (
                      <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">{menu}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-[11px] tabnum text-slate-400">{fmt(l.created_at)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <p className="mt-3 text-xs text-slate-400">
        予約の作成・日時／担当の変更・キャンセルを自動記録します（新しい順・最大300件）。ドラッグで誤って動かした場合もここで確認できます。
      </p>
    </div>
  );
}
