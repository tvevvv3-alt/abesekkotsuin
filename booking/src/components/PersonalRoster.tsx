"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadAllStaff } from "@/lib/data";
import type { Staff } from "@/lib/types";

// パーソナルトレーニング 回数券（1行＝1冊）。体幹教室とほぼ同じ見た目で、
// 来院日時は手入力（予約表とは連動しない）。
interface Ticket {
  id: string;
  name: string;
  staff_id: string | null;
  expiry: string | null;
  kind: string;
  quota: number;
  visits: string[]; // datetime-local 文字列（"2026-04-27T10:30"）。空文字は未入力。
  sort_order: number;
}

// datetime-local 文字列を "M/D HH:MM" に
function fmtVisit(v: string): string {
  if (!v) return "";
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/);
  if (!m) return v;
  return `${Number(m[2])}/${Number(m[3])} ${m[4]}:${m[5]}`;
}

export default function PersonalRoster() {
  const supabase = useMemo(() => createClient(), []);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [rows, setRows] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [staffFilter, setStaffFilter] = useState<string>("all");

  const reload = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from("personal_tickets")
      .select("id, name, staff_id, expiry, kind, quota, visits, sort_order")
      .order("sort_order")
      .order("created_at");
    setRows(
      ((data as Ticket[]) ?? []).map((r) => ({
        ...r,
        visits: Array.isArray(r.visits) ? r.visits : [],
      }))
    );
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadAllStaff(supabase)
      .then((st) => setStaff(st.filter((s) => s.status === "active" && s.admin_visible !== false)))
      .catch(() => {});
    reload();
  }, [supabase, reload]);

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  const shown = useMemo(
    () => (staffFilter === "all" ? rows : rows.filter((r) => r.staff_id === staffFilter)),
    [rows, staffFilter]
  );

  // 表示する「◯回目」列数（各行の quota と入力済み数の最大。最低6）
  const maxCols = useMemo(() => {
    let n = 10;
    rows.forEach((r) => {
      const filled = r.visits.filter(Boolean).length;
      n = Math.max(n, r.quota, filled);
    });
    return n;
  }, [rows]);

  function setLocal(id: string, patch: Partial<Ticket>) {
    setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  async function persist(id: string) {
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    await supabase
      .from("personal_tickets")
      .update({
        name: r.name,
        staff_id: r.staff_id,
        expiry: r.expiry,
        kind: r.kind,
        quota: r.quota,
        visits: r.visits,
      })
      .eq("id", id);
  }
  function setVisit(id: string, idx: number, value: string) {
    setRows((p) =>
      p.map((r) => {
        if (r.id !== id) return r;
        const v = [...r.visits];
        while (v.length <= idx) v.push("");
        v[idx] = value;
        return { ...r, visits: v };
      })
    );
  }

  async function addRow() {
    const { data, error } = await supabase
      .from("personal_tickets")
      .insert({ name: "", staff_id: null, expiry: null, kind: "パーソナル", quota: 10, visits: [], sort_order: rows.length })
      .select("id, name, staff_id, expiry, kind, quota, visits, sort_order")
      .single();
    if (error) {
      alert("追加できませんでした：\n" + error.message + "\n（migration_personal_tickets.sql を実行済みかご確認ください）");
      return;
    }
    if (data) setRows((p) => [...p, { ...(data as Ticket), visits: [] }]);
  }
  async function deleteRow(id: string) {
    if (!confirm("この回数券を削除しますか？")) return;
    setRows((p) => p.filter((r) => r.id !== id));
    await supabase.from("personal_tickets").delete().eq("id", id);
  }

  const amt =
    "w-full rounded border border-slate-300 px-1 py-0.5 text-sm focus:border-blue-400 focus:outline-none";

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800">パーソナル 回数券</h1>
        <button
          onClick={addRow}
          className="rounded-md bg-blue-600 px-2.5 py-1 text-[12px] font-bold text-white active:bg-blue-700"
        >
          ＋ 会員を追加
        </button>
        {/* 担当フィルタ */}
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[11px] text-slate-400">担当</span>
          <select
            value={staffFilter}
            onChange={(e) => setStaffFilter(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1 text-xs"
          >
            <option value="all">すべて</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>
                {s.display_name || s.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-500">読み込み中…</p>
      ) : shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">
          回数券がありません。「＋ 会員を追加」から登録してください。
        </p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500">
                <th className="sticky left-0 z-10 w-[128px] min-w-[128px] max-w-[128px] border-b border-r bg-slate-50 px-2 py-1.5 text-left font-bold">
                  名前
                </th>
                <th className="whitespace-nowrap border-b border-l px-2 py-1.5 text-center font-bold">担当</th>
                <th className="whitespace-nowrap border-b border-l px-2 py-1.5 text-center font-bold">有効期限</th>
                <th className="whitespace-nowrap border-b border-l px-2 py-1.5 text-center font-bold">回数</th>
                <th className="whitespace-nowrap border-b border-l px-2 py-1.5 text-center font-bold">残</th>
                {Array.from({ length: maxCols }).map((_, i) => (
                  <th key={i} className="whitespace-nowrap border-b border-l px-2 py-1.5 text-center font-bold">
                    {i + 1}回目
                  </th>
                ))}
                <th className="whitespace-nowrap border-b border-l px-2 py-1.5"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const st = r.staff_id ? staffById.get(r.staff_id) : null;
                const filled = r.visits.filter(Boolean).length;
                const remain = r.quota - filled;
                return (
                  <tr key={r.id} className="border-t">
                    <td className="sticky left-0 z-10 w-[128px] min-w-[128px] max-w-[128px] border-r bg-white px-1.5 py-1.5 align-top">
                      <input
                        value={r.name}
                        placeholder="お名前"
                        onChange={(e) => setLocal(r.id, { name: e.target.value })}
                        onBlur={() => persist(r.id)}
                        className={`${amt} font-bold text-slate-800`}
                      />
                    </td>
                    <td className="border-l px-1 py-1.5 align-top">
                      <select
                        value={r.staff_id ?? ""}
                        onChange={(e) => { setLocal(r.id, { staff_id: e.target.value || null }); setTimeout(() => persist(r.id), 0); }}
                        className="w-[84px] rounded border px-1 py-0.5 text-[11px] font-bold"
                        style={{
                          backgroundColor: st?.color || "#94a3b8",
                          borderColor: st?.color || "#94a3b8",
                          color: "#fff",
                        }}
                      >
                        <option value="" style={{ color: "#111" }}>—</option>
                        {staff.map((s) => (
                          <option key={s.id} value={s.id} style={{ color: "#111" }}>
                            {s.display_name || s.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="border-l px-1 py-1.5 align-top">
                      <input
                        value={r.expiry ?? ""}
                        placeholder="例：8月末"
                        onChange={(e) => setLocal(r.id, { expiry: e.target.value })}
                        onBlur={() => persist(r.id)}
                        className={`${amt} w-[72px] text-center`}
                      />
                    </td>
                    <td className="border-l px-1 py-1.5 text-center align-top">
                      <input
                        type="number"
                        min={0}
                        value={r.quota || ""}
                        onChange={(e) => setLocal(r.id, { quota: parseInt(e.target.value || "0", 10) })}
                        onBlur={() => persist(r.id)}
                        className={`${amt} w-[44px] text-center tabnum`}
                      />
                    </td>
                    <td className="border-l px-1 py-1.5 text-center align-top">
                      <span
                        className={`text-xs font-bold ${
                          remain <= 0 ? "text-red-500" : remain <= 1 ? "text-orange-500" : "text-blue-600"
                        }`}
                      >
                        残{Math.max(0, remain)}
                      </span>
                    </td>
                    {Array.from({ length: maxCols }).map((_, i) => {
                      const val = r.visits[i] ?? "";
                      const over = i >= r.quota; // 回数券の回数を超える列は薄く
                      return (
                        <td key={i} className={`border-l px-1 py-1.5 align-top ${over ? "bg-slate-50/60" : ""}`}>
                          <input
                            type="datetime-local"
                            value={val}
                            onChange={(e) => setVisit(r.id, i, e.target.value)}
                            onBlur={() => persist(r.id)}
                            className="w-[150px] rounded border border-slate-300 px-1 py-0.5 text-[11px] text-slate-700 focus:border-blue-400 focus:outline-none"
                          />
                          {val && (
                            <div className="mt-0.5 text-center text-[10px] font-bold text-slate-500">{fmtVisit(val)}</div>
                          )}
                        </td>
                      );
                    })}
                    <td className="border-l px-1 py-1.5 text-center align-top">
                      <button onClick={() => deleteRow(r.id)} className="text-[11px] font-bold text-red-400">
                        削除
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-400">
        1行＝回数券1冊。名前・担当・有効期限・種類・回数を入れ、各回のマスに来院日時を入力すると「残」が自動計算されます。
        名前は横スクロールしても固定。来院日時は手入力（体幹教室のように予約表とは連動しません）。
        同じ方が2冊目を作る場合はもう1行追加してください。
      </p>
    </div>
  );
}
