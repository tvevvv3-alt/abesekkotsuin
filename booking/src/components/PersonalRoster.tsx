"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadAllStaff } from "@/lib/data";
import { minToLabel } from "@/lib/booking";
import type { Staff } from "@/lib/types";

// パーソナルトレーニング 回数券（1行＝1冊）。
// 「パーソナル回数券対象」メニューの予約を、患者名で一致する会員に自動反映。
// 消費：所要30分=1回・60分=2回（＝30分単位で切り上げ）。
interface Ticket {
  id: string;
  name: string;
  staff_id: string | null;
  expiry: string | null;
  quota: number;
  used_offset: number; // 移行前の使用済み（手入力）
  sort_order: number;
}

interface Visit {
  id: string;
  patient_name: string | null;
  date: string;
  start_min: number;
  end_min: number;
}

// 消費回数（30分=1・60分=2・以降30分ごと+1）
function consumeOf(v: Visit): number {
  return Math.max(1, Math.round((v.end_min - v.start_min) / 30));
}
function mdLabel(date: string): string {
  const m = date.match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${Number(m[1])}/${Number(m[2])}` : date;
}

export default function PersonalRoster() {
  const supabase = useMemo(() => createClient(), []);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [rows, setRows] = useState<Ticket[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [hasPersonalMenu, setHasPersonalMenu] = useState(true);
  const [loading, setLoading] = useState(true);
  const [staffFilter, setStaffFilter] = useState<string>("all");

  const reload = useCallback(async () => {
    setLoading(true);
    // 回数券対象メニュー
    const { data: sv } = await supabase.from("services").select("id, personal");
    const personalIds = ((sv as { id: string; personal: boolean }[] | null) ?? [])
      .filter((s) => s.personal)
      .map((s) => s.id);
    setHasPersonalMenu(personalIds.length > 0);

    const [{ data: tk }, appts] = await Promise.all([
      supabase
        .from("personal_tickets")
        .select("id, name, staff_id, expiry, quota, used_offset, sort_order")
        .order("sort_order")
        .order("created_at"),
      personalIds.length
        ? supabase
            .from("appointments")
            .select("id, patient_name, date, start_min, end_min")
            .in("service_id", personalIds)
            .neq("status", "cancelled")
            .order("date")
            .order("start_min")
        : Promise.resolve({ data: [] as Visit[] }),
    ]);
    setRows(((tk as Ticket[]) ?? []).map((r) => ({ ...r, used_offset: r.used_offset ?? 0 })));
    setVisits((appts.data as Visit[]) ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadAllStaff(supabase)
      .then((st) => setStaff(st.filter((s) => s.status === "active" && s.admin_visible !== false)))
      .catch(() => {});
    reload();
  }, [supabase, reload]);

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

  // 患者名 → 来院（自動）
  const visitsByName = useMemo(() => {
    const m = new Map<string, Visit[]>();
    visits.forEach((v) => {
      const key = (v.patient_name || "").trim();
      if (!key) return;
      const a = m.get(key) ?? [];
      a.push(v);
      m.set(key, a);
    });
    return m;
  }, [visits]);

  const shown = useMemo(
    () => (staffFilter === "all" ? rows : rows.filter((r) => r.staff_id === staffFilter)),
    [rows, staffFilter]
  );

  const maxCols = useMemo(() => {
    let n = 6;
    rows.forEach((r) => {
      n = Math.max(n, (visitsByName.get(r.name.trim()) ?? []).length);
    });
    return n;
  }, [rows, visitsByName]);

  function setLocal(id: string, patch: Partial<Ticket>) {
    setRows((p) => p.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  async function persist(id: string) {
    const r = rows.find((x) => x.id === id);
    if (!r) return;
    await supabase
      .from("personal_tickets")
      .update({ name: r.name, staff_id: r.staff_id, expiry: r.expiry, quota: r.quota, used_offset: r.used_offset })
      .eq("id", id);
  }

  async function addRow() {
    const { data, error } = await supabase
      .from("personal_tickets")
      .insert({ name: "", staff_id: null, expiry: null, kind: "パーソナル", quota: 10, used_offset: 0, visits: [], sort_order: rows.length })
      .select("id, name, staff_id, expiry, quota, used_offset, sort_order")
      .single();
    if (error) {
      alert("追加できませんでした：\n" + error.message + "\n（migration_personal_tickets.sql / migration_personal_used_offset.sql を実行済みかご確認ください）");
      return;
    }
    if (data) setRows((p) => [...p, { ...(data as Ticket), used_offset: 0 }]);
  }
  async function deleteRow(id: string) {
    if (!confirm("この回数券を削除しますか？（来院記録は予約側なので残ります）")) return;
    setRows((p) => p.filter((r) => r.id !== id));
    await supabase.from("personal_tickets").delete().eq("id", id);
  }

  const amt = "w-full rounded border border-slate-300 px-1 py-0.5 text-sm focus:border-blue-400 focus:outline-none";

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800">パーソナル 回数券</h1>
        <button onClick={addRow} className="rounded-md bg-blue-600 px-2.5 py-1 text-[12px] font-bold text-white active:bg-blue-700">
          ＋ 会員を追加
        </button>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-[11px] text-slate-400">担当</span>
          <select value={staffFilter} onChange={(e) => setStaffFilter(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1 text-xs">
            <option value="all">すべて</option>
            {staff.map((s) => (
              <option key={s.id} value={s.id}>{s.display_name || s.name}</option>
            ))}
          </select>
        </div>
      </div>

      {!hasPersonalMenu && (
        <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          「パーソナル回数券対象」のメニューが未設定です。施術メニュー管理で <b>パーソナル30分／60分</b> を作り、
          <b>「パーソナル回数券」にチェック</b>を入れてください。以降その予約が自動で下の表に反映されます（30分=1回・60分=2回）。
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-500">読み込み中…</p>
      ) : shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">回数券がありません。「＋ 会員を追加」から登録してください。</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500">
                <th className="sticky left-0 z-10 w-[120px] min-w-[120px] max-w-[120px] border-b border-r bg-slate-50 px-2 py-1 text-left font-bold">名前</th>
                <th className="whitespace-nowrap border-b border-l px-2 py-1 text-center font-bold">担当</th>
                <th className="whitespace-nowrap border-b border-l px-2 py-1 text-center font-bold">有効期限</th>
                <th className="whitespace-nowrap border-b border-l px-1 py-1 text-center font-bold">回数</th>
                <th className="whitespace-nowrap border-b border-l px-1 py-1 text-center font-bold">既使用</th>
                <th className="whitespace-nowrap border-b border-l px-1 py-1 text-center font-bold">残</th>
                {Array.from({ length: maxCols }).map((_, i) => (
                  <th key={i} className="whitespace-nowrap border-b border-l px-2 py-1 text-center font-bold">{i + 1}回目</th>
                ))}
                <th className="whitespace-nowrap border-b border-l px-1 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const st = r.staff_id ? staffById.get(r.staff_id) : null;
                const vs = (visitsByName.get(r.name.trim()) ?? []);
                const autoConsumed = vs.reduce((n, v) => n + consumeOf(v), 0);
                const remain = r.quota - (r.used_offset ?? 0) - autoConsumed;
                return (
                  <tr key={r.id} className="border-t">
                    <td className="sticky left-0 z-10 w-[120px] min-w-[120px] max-w-[120px] border-r bg-white px-1.5 py-1 align-middle">
                      <input value={r.name} placeholder="お名前" onChange={(e) => setLocal(r.id, { name: e.target.value })} onBlur={() => persist(r.id)} className={`${amt} font-bold text-slate-800`} />
                    </td>
                    <td className="border-l px-1 py-1 align-middle">
                      <select
                        value={r.staff_id ?? ""}
                        onChange={(e) => { setLocal(r.id, { staff_id: e.target.value || null }); setTimeout(() => persist(r.id), 0); }}
                        className="w-[84px] rounded border px-1 py-0.5 text-[11px] font-bold"
                        style={{ backgroundColor: st?.color || "#94a3b8", borderColor: st?.color || "#94a3b8", color: "#fff" }}
                      >
                        <option value="" style={{ color: "#111" }}>—</option>
                        {staff.map((s) => (
                          <option key={s.id} value={s.id} style={{ color: "#111" }}>{s.display_name || s.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="border-l px-1 py-1 align-middle">
                      <input value={r.expiry ?? ""} placeholder="例：8月末" onChange={(e) => setLocal(r.id, { expiry: e.target.value })} onBlur={() => persist(r.id)} className={`${amt} w-[72px] text-center`} />
                    </td>
                    <td className="border-l px-1 py-1 text-center align-middle">
                      <input type="number" min={0} value={r.quota || ""} onChange={(e) => setLocal(r.id, { quota: parseInt(e.target.value || "0", 10) })} onBlur={() => persist(r.id)} className={`${amt} w-[40px] text-center tabnum`} />
                    </td>
                    <td className="border-l px-1 py-1 text-center align-middle">
                      <input type="number" min={0} value={r.used_offset || ""} placeholder="0" onChange={(e) => setLocal(r.id, { used_offset: parseInt(e.target.value || "0", 10) })} onBlur={() => persist(r.id)} className={`${amt} w-[40px] text-center tabnum`} />
                    </td>
                    <td className="border-l px-1 py-1 text-center align-middle">
                      <span className={`text-xs font-bold ${remain <= 0 ? "text-red-500" : remain <= 2 ? "text-orange-500" : "text-blue-600"}`}>残{Math.max(0, remain)}</span>
                    </td>
                    {Array.from({ length: maxCols }).map((_, i) => {
                      const v = vs[i];
                      if (!v) return <td key={i} className="border-l px-1.5 py-1" />;
                      const c = consumeOf(v);
                      return (
                        <td key={i} className="whitespace-nowrap border-l px-1.5 py-1 text-center align-middle">
                          <div className="text-[12px] font-medium text-slate-700">
                            {mdLabel(v.date)}
                            <span className="ml-1 text-[10px] text-slate-500">{minToLabel(v.start_min)}</span>
                          </div>
                          <div className="text-[9px] font-bold text-slate-400">
                            {v.end_min - v.start_min}分{c >= 2 ? <span className="ml-0.5 rounded bg-orange-100 px-1 text-orange-600">×{c}</span> : null}
                          </div>
                        </td>
                      );
                    })}
                    <td className="border-l px-1 py-1 text-center align-middle">
                      <button onClick={() => deleteRow(r.id)} className="text-[11px] font-bold text-red-400">削除</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-400">
        「パーソナル回数券対象」メニューの予約が、患者名の一致で自動反映されます（<b>30分=1回・60分=2回</b>）。
        <b>残</b>＝回数 − 既使用 − 予約からの消費。移行前にすでに使った回数は「既使用」に入れてください。
        担当・有効期限・回数はこの表で、来院日時は予約（カレンダー）で管理します。
      </p>
    </div>
  );
}
