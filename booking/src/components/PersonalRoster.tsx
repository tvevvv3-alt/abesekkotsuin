"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadAllStaff } from "@/lib/data";
import { minToLabel, toDateStr } from "@/lib/booking";
import type { Staff } from "@/lib/types";
import SendMessageModal from "@/components/SendMessageModal";

// パーソナルトレーニング 回数券。体幹教室と同じ仕組み：
// 「パーソナル回数券対象」メニューの予約が患者名で自動的にここに並び、
// 各回を「タップで終了」すると消費（30分=1・60分=2）＋本人へLINE送信。
// 未登録の人が予約すると自動で行が作られる。
interface Ticket {
  id: string;
  name: string;
  staff_id: string | null;
  expiry: string | null;
  quota: number;
  used_offset: number;
  sort_order: number;
}

interface Visit {
  id: string;
  patient_name: string | null;
  date: string;
  start_min: number;
  end_min: number;
  status: "booked" | "cancelled" | "done";
  staff_id: string | null;
  service_id: string | null;
  line_user_id: string | null;
}

function consumeOf(v: Visit): number {
  return Math.max(1, Math.round((v.end_min - v.start_min) / 30));
}
function mdLabel(date: string): string {
  const m = date.match(/^\d{4}-(\d{2})-(\d{2})/);
  return m ? `${Number(m[1])}/${Number(m[2])}` : date;
}
// 有効期限ラベル（初回来院＋Nヶ月の「M月末」）
function expiryLabel(date: string, months: number): string {
  const d = new Date(date + "T00:00:00");
  d.setMonth(d.getMonth() + months);
  return `${d.getMonth() + 1}月末`;
}

export default function PersonalRoster() {
  const supabase = useMemo(() => createClient(), []);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [rows, setRows] = useState<Ticket[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [hasPersonalMenu, setHasPersonalMenu] = useState(true);
  const [loading, setLoading] = useState(true);
  // 終了通知の送信前プレビュー＆編集
  const [sendMsg, setSendMsg] = useState<
    | { title: string; endpoint: string; payload: Record<string, unknown>; note?: string; afterSend?: () => void | Promise<void> }
    | null
  >(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [staffFilter, setStaffFilter] = useState<string>("all");
  // 来院（予約）の編集ポップアップ：氏名・日付・時刻を直せる（同姓同名/兄弟の付け替え）
  const [ev, setEv] = useState<
    | { id: string; name: string; date: string; time: string; start_min: number; end_min: number; done: boolean; line_user_id: string | null }
    | null
  >(null);
  const [personalSvcList, setPersonalSvcList] = useState<{ id: string; name: string }[]>([]);
  // ＋予約（回数券から予約を追加）
  const [add, setAdd] = useState<{ name: string } | null>(null);
  const [addSvc, setAddSvc] = useState("");
  const [addStaff, setAddStaff] = useState<string | null>(null);
  const [addDate, setAddDate] = useState(() => toDateStr(new Date()));
  const [addTime, setAddTime] = useState("10:00");
  const [adding, setAdding] = useState(false);

  async function bookVisit() {
    if (!add || !addSvc) return;
    if (!add.name.trim()) { alert("会員名を入力してください"); return; }
    if (!addStaff) { alert("担当を選んでください"); return; }
    const [h, m] = addTime.split(":").map((x) => parseInt(x, 10));
    const start = (h || 0) * 60 + (m || 0);
    setAdding(true);
    const { data, error } = await supabase.rpc("book_appointment", {
      p_service_id: addSvc,
      p_staff_id: addStaff,
      p_date: addDate,
      p_start_min: start,
      p_name: add.name.trim(),
      p_source: "admin",
    });
    setAdding(false);
    if (error) { alert("予約できませんでした：\n" + error.message); return; }
    const res = data as { ok: boolean; reason?: string };
    if (!res.ok) { alert(res.reason || "予約できませんでした（枠が埋まっている可能性）"); return; }
    setAdd(null);
    reload();
  }

  const reload = useCallback(async () => {
    setLoading(true);
    // 回数券対象メニュー（＋有効期限の月数）
    const { data: sv } = await supabase.from("services").select("id, name, personal, personal_valid_months, sort_order");
    const personalSvc = ((sv as { id: string; name: string; personal: boolean; personal_valid_months: number | null; sort_order: number }[] | null) ?? [])
      .filter((s) => s.personal)
      .sort((a, b) => a.sort_order - b.sort_order);
    const personalIds = personalSvc.map((s) => s.id);
    const vmById = new Map(personalSvc.map((s) => [s.id, s.personal_valid_months ?? 5]));
    setHasPersonalMenu(personalIds.length > 0);
    setPersonalSvcList(personalSvc.map((s) => ({ id: s.id, name: s.name })));

    const [{ data: tk }, appts] = await Promise.all([
      supabase
        .from("personal_tickets")
        .select("id, name, staff_id, expiry, quota, used_offset, sort_order")
        .order("sort_order")
        .order("created_at"),
      personalIds.length
        ? supabase
            .from("appointments")
            .select("id, patient_name, date, start_min, end_min, status, staff_id, service_id, line_user_id")
            .in("service_id", personalIds)
            .neq("status", "cancelled")
            .order("date")
            .order("start_min")
        : Promise.resolve({ data: [] as Visit[] }),
    ]);
    let tickets = ((tk as Ticket[]) ?? []).map((r) => ({ ...r, used_offset: r.used_offset ?? 0 }));
    const visitData = (appts.data as Visit[]) ?? [];

    // 予約を患者名でまとめる（既にorder byで日付順）
    const groups = new Map<string, Visit[]>();
    visitData.forEach((v) => {
      const key = (v.patient_name || "").trim();
      if (!key) return;
      const a = groups.get(key) ?? [];
      a.push(v);
      groups.set(key, a);
    });
    // 既存の回数券を名前ごとにまとめ、容量（スタンプ）を集計
    const tksByName = new Map<string, Ticket[]>();
    tickets.forEach((t) => {
      const k = t.name.trim();
      if (!k) return;
      const a = tksByName.get(k) ?? [];
      a.push(t);
      tksByName.set(k, a);
    });
    // 回数券は10スタンプ。60分=2スタンプ。スタンプが券の容量を超えたら
    // 新しい回数券（2枚目…）を自動追加する（＝11回目は新しい段へ）。
    const toCreate: Record<string, unknown>[] = [];
    let sortSeq = 900;
    groups.forEach((list, nm) => {
      const totalStamps = list.reduce((n, v) => n + consumeOf(v), 0);
      const tks = tksByName.get(nm) ?? [];
      let cap = tks.reduce((n, t) => n + Math.max(0, (t.quota ?? 10) - (t.used_offset ?? 0)), 0);
      const first = list[0];
      const vm = vmById.get(first.service_id ?? "") ?? 5;
      const staffId = [...list].reverse().find((a) => a.staff_id)?.staff_id ?? null;
      // 券が1枚も無ければ1枚目を作る（担当・有効期限つき）
      if (tks.length === 0) {
        toCreate.push({ name: nm, staff_id: staffId, expiry: expiryLabel(first.date, vm), kind: "パーソナル", quota: 10, used_offset: 0, visits: [], sort_order: sortSeq++ });
        cap += 10;
      }
      // スタンプが容量を超えるぶん、10スタンプ券を追加
      while (cap < totalStamps) {
        toCreate.push({ name: nm, staff_id: staffId, expiry: null, kind: "パーソナル", quota: 10, used_offset: 0, visits: [], sort_order: sortSeq++ });
        cap += 10;
      }
    });
    if (toCreate.length) {
      const { data: created } = await supabase
        .from("personal_tickets")
        .insert(toCreate)
        .select("id, name, staff_id, expiry, quota, used_offset, sort_order");
      tickets = [...tickets, ...(((created as Ticket[]) ?? []).map((r) => ({ ...r, used_offset: r.used_offset ?? 0 })))];
    }

    setRows(tickets);
    setVisits(visitData);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    loadAllStaff(supabase)
      .then((st) => setStaff(st.filter((s) => s.status === "active" && s.admin_visible !== false)))
      .catch(() => {});
    reload();
  }, [supabase, reload]);

  const staffById = useMemo(() => new Map(staff.map((s) => [s.id, s])), [staff]);

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

  // 会員の来院を「回数券（10スタンプ）」ごとに割り当てて“段”を作る。
  // 60分=2スタンプ。1枚が10スタンプ埋まったら次の券（2枚目…）へ。
  const couponRows = useMemo(() => {
    const ticketsByName = new Map<string, Ticket[]>();
    const nameOrder: string[] = [];
    const emptyTickets: Ticket[] = [];
    rows.forEach((t) => {
      const k = t.name.trim();
      if (!k) { emptyTickets.push(t); return; }
      if (!ticketsByName.has(k)) { ticketsByName.set(k, []); nameOrder.push(k); }
      ticketsByName.get(k)!.push(t);
    });
    const out: { ticket: Ticket; visits: Visit[]; idx: number; total: number }[] = [];
    nameOrder.forEach((k) => {
      const tks = [...ticketsByName.get(k)!].sort((a, b) => a.sort_order - b.sort_order);
      const visits = [...(visitsByName.get(k) ?? [])].sort((a, b) => a.date.localeCompare(b.date) || a.start_min - b.start_min);
      let vi = 0;
      tks.forEach((tk, i) => {
        const capacity = Math.max(0, (tk.quota ?? 10) - (tk.used_offset ?? 0)); // 使えるスタンプ数
        const assigned: Visit[] = [];
        let used = 0;
        while (vi < visits.length) {
          const c = consumeOf(visits[vi]);
          if (used + c > capacity) break; // この券は満杯 → 次の券へ
          assigned.push(visits[vi]);
          used += c;
          vi++;
        }
        out.push({ ticket: tk, visits: assigned, idx: i, total: tks.length });
      });
      // 端数（券が足りない保険。通常はreloadで新券が作られる）→ 最後の券に載せる
      if (vi < visits.length && out.length) out[out.length - 1].visits.push(...visits.slice(vi));
    });
    emptyTickets.forEach((t) => out.push({ ticket: t, visits: [], idx: 0, total: 1 }));
    return staffFilter === "all" ? out : out.filter((r) => r.ticket.staff_id === staffFilter);
  }, [rows, visitsByName, staffFilter]);

  // 列は回数券の枠数（既定10）まで。11列目は作らない。
  const maxCols = useMemo(() => Math.max(10, ...rows.map((r) => r.quota ?? 10)), [rows]);

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

  // ポップアップから：氏名・日付・時刻を保存（所要時間は維持）
  async function saveVisit() {
    if (!ev) return;
    const [h, m] = ev.time.split(":").map((x) => parseInt(x, 10));
    const start = (h || 0) * 60 + (m || 0);
    const dur = Math.max(0, ev.end_min - ev.start_min);
    await supabase
      .from("appointments")
      .update({ patient_name: ev.name.trim(), date: ev.date, start_min: start, end_min: start + dur })
      .eq("id", ev.id);
    setEv(null);
    reload();
  }
  // ポップアップから：終了＋LINE
  async function finishFromPopup() {
    if (!ev) return;
    const id = ev.id;
    const nm = ev.name?.trim() || "この方";
    if (ev.line_user_id) {
      // LINE連携あり → 送信本文をプレビュー＆編集してから送信。送信成功で「終了」に。
      setEv(null);
      setSendMsg({
        title: "パーソナル 終了＋LINE",
        endpoint: "/api/personal/done",
        payload: { appointmentId: id },
        note: "送信すると、この予約は「終了」になり回数券を消費します。",
        afterSend: async () => {
          await supabase.from("appointments").update({ status: "done" }).eq("id", id);
          setMsg(`${nm}：終了＋LINEを送信しました`);
          reload();
        },
      });
      return;
    }
    // LINE未連携 → 確認して終了のみ（通知なし）
    if (!confirm(`${nm} を終了しますか？\n（LINE未連携のため通知は送られません）`)) return;
    setEv(null);
    await supabase.from("appointments").update({ status: "done" }).eq("id", id);
    setMsg(`${nm}：終了しました（LINE未連携のため通知なし）`);
    reload();
  }

  const amt = "w-full rounded border border-slate-300 px-1 py-0.5 text-sm focus:border-blue-400 focus:outline-none";

  return (
    <div className="mx-auto max-w-6xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800">パーソナル 回数券</h1>
        <button
          onClick={() => { setAdd({ name: "" }); setAddStaff(null); setAddSvc(personalSvcList[0]?.id ?? ""); setAddDate(toDateStr(new Date())); setAddTime("10:00"); }}
          className="rounded-md bg-emerald-600 px-2.5 py-1 text-[12px] font-bold text-white active:bg-emerald-700"
        >
          ＋ 予約追加
        </button>
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
          <b>「パーソナル回数券」にチェック</b>を入れてください。以降その予約が自動でここに並びます。
        </div>
      )}

      {msg && <div className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">{msg}</div>}

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-500">読み込み中…</p>
      ) : couponRows.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">回数券がありません。パーソナル予約が入ると自動で並びます。</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 text-slate-500">
                <th className="sticky left-0 z-10 w-[120px] min-w-[120px] max-w-[120px] border-b border-r bg-slate-50 px-2 py-1 text-left font-bold">名前</th>
                <th className="whitespace-nowrap border-b border-l px-1 py-1 text-center font-bold">担当</th>
                <th className="whitespace-nowrap border-b border-l px-1 py-1 text-center font-bold">有効期限</th>
                <th className="whitespace-nowrap border-b border-l px-1 py-1 text-center font-bold">残</th>
                {Array.from({ length: maxCols }).map((_, i) => (
                  <th key={i} className="whitespace-nowrap border-b border-l px-2 py-1 text-center font-bold">{i + 1}回目</th>
                ))}
                <th className="whitespace-nowrap border-b border-l px-1 py-1"></th>
              </tr>
            </thead>
            <tbody>
              {couponRows.map((cr) => {
                const r = cr.ticket;
                const st = r.staff_id ? staffById.get(r.staff_id) : null;
                const vs = cr.visits; // この回数券に割り当てられた来院だけ
                const off = r.used_offset ?? 0; // 繰越（既消費）→ 先頭を✕で潰す
                const quota = r.quota ?? 10;
                const consumedDone = vs.filter((v) => v.status === "done").reduce((n, v) => n + consumeOf(v), 0);
                const remain = quota - off - consumedDone;
                return (
                  <tr key={r.id} className="border-t">
                    <td className="sticky left-0 z-10 w-[120px] min-w-[120px] max-w-[120px] border-r bg-white px-1.5 py-1 align-middle">
                      {cr.idx === 0 ? (
                        <input value={r.name} placeholder="お名前" onChange={(e) => setLocal(r.id, { name: e.target.value })} onBlur={() => persist(r.id)} className={`${amt} font-bold text-slate-800`} />
                      ) : (
                        <div className="truncate text-[13px] font-bold text-slate-800">
                          {r.name}
                          <span className="ml-1 rounded bg-indigo-100 px-1 text-[10px] font-bold text-indigo-600">{cr.idx + 1}枚目</span>
                        </div>
                      )}
                      {cr.idx === 0 && cr.total > 1 && (
                        <span className="mt-0.5 inline-block rounded bg-slate-100 px-1 text-[9px] font-bold text-slate-500">1枚目 / 全{cr.total}枚</span>
                      )}
                    </td>
                    <td className="border-l px-1 py-1 align-middle">
                      <select
                        value={r.staff_id ?? ""}
                        onChange={(e) => { setLocal(r.id, { staff_id: e.target.value || null }); setTimeout(() => persist(r.id), 0); }}
                        className="w-[52px] rounded border px-0.5 py-0.5 text-[11px] font-bold"
                        style={{ backgroundColor: st?.color || "#94a3b8", borderColor: st?.color || "#94a3b8", color: "#fff" }}
                      >
                        <option value="" style={{ color: "#111" }}>—</option>
                        {staff.map((s) => (
                          <option key={s.id} value={s.id} style={{ color: "#111" }}>{s.display_name || s.name}</option>
                        ))}
                      </select>
                    </td>
                    <td className="border-l px-1 py-1 align-middle">
                      <input value={r.expiry ?? ""} placeholder="例：8月末" onChange={(e) => setLocal(r.id, { expiry: e.target.value })} onBlur={() => persist(r.id)} className={`${amt} w-[56px] text-center`} />
                    </td>
                    <td className="border-l px-1 py-1 text-center align-middle">
                      <span className={`block text-xs font-bold ${remain <= 0 ? "text-red-500" : remain <= 2 ? "text-orange-500" : "text-blue-600"}`}>残{Math.max(0, remain)}</span>
                      {/* ◀▶で予約を右／左にスライド（繰越＝1〜N回目を✕＝消費済みに） */}
                      <div
                        className="mx-auto mt-0.5 flex w-fit items-center overflow-hidden rounded border border-amber-300 bg-amber-50"
                        title="▶で予約を右へずらす（1〜N回目を✕＝消費済みに）。◀で戻す。前システム・前月からの繰越に。"
                      >
                        <button
                          onClick={() => { setLocal(r.id, { used_offset: Math.max(0, off - 1) }); setTimeout(() => persist(r.id), 0); }}
                          disabled={off <= 0}
                          className="px-1 text-[10px] font-bold text-amber-700 active:bg-amber-100 disabled:opacity-30"
                          aria-label="左へ戻す"
                        >
                          ◀
                        </button>
                        <span className="min-w-[13px] border-x border-amber-200 text-center text-[10px] font-bold text-amber-700">{off}</span>
                        <button
                          onClick={() => { setLocal(r.id, { used_offset: off + 1 }); setTimeout(() => persist(r.id), 0); }}
                          className="px-1 text-[10px] font-bold text-amber-700 active:bg-amber-100"
                          aria-label="右へずらす"
                        >
                          ▶
                        </button>
                      </div>
                    </td>
                    {(() => {
                      // スタンプ単位でセルを組む。繰越✕(各1)→来院(60分=2はcolSpan2)→残り空き。
                      const cells = [];
                      let stamp = 0;
                      for (let k = 0; k < off && stamp < maxCols; k++, stamp++) {
                        cells.push(
                          <td key={`x${k}`} className="border-l bg-slate-50 px-1.5 py-1 text-center align-middle">
                            <span className="text-[13px] font-bold text-slate-300" title="繰越（消費済み）">✕</span>
                          </td>
                        );
                      }
                      vs.forEach((v) => {
                        const c = consumeOf(v);
                        const done = v.status === "done";
                        cells.push(
                          <td
                            key={v.id}
                            colSpan={c}
                            onClick={() => setEv({ id: v.id, name: v.patient_name ?? "", date: v.date, time: minToLabel(v.start_min), start_min: v.start_min, end_min: v.end_min, done, line_user_id: v.line_user_id })}
                            className={`whitespace-nowrap border-l px-1.5 py-1 text-center align-middle ${done ? "bg-slate-50 text-slate-400" : "cursor-pointer hover:bg-blue-50"}`}
                          >
                            <div className="text-[12px] font-medium text-slate-700">
                              {mdLabel(v.date)}
                              <span className="ml-1 text-[10px] text-slate-500">{minToLabel(v.start_min)}</span>
                            </div>
                            <div className="text-[9px] font-bold text-slate-400">
                              {v.end_min - v.start_min}分{c >= 2 ? <span className="ml-0.5 rounded bg-orange-100 px-1 text-orange-600">×{c}</span> : null}
                            </div>
                            {done ? (
                              v.line_user_id ? (
                                <div className="text-[9px] font-bold text-emerald-600">✅ 通知済</div>
                              ) : (
                                <div className="text-[9px] font-bold text-slate-400">済・通知なし</div>
                              )
                            ) : (
                              <div className="text-[9px] text-blue-500">タップで編集/終了</div>
                            )}
                          </td>
                        );
                        stamp += c;
                      });
                      let firstEmpty = true;
                      while (stamp < maxCols) {
                        const showPlus = firstEmpty && !!r.name.trim();
                        cells.push(
                          <td key={`e${stamp}`} className="border-l px-1.5 py-1 text-center align-middle">
                            {showPlus && (
                              <button
                                onClick={() => { setAdd({ name: r.name }); setAddStaff(r.staff_id); setAddSvc(personalSvcList[0]?.id ?? ""); setAddDate(toDateStr(new Date())); setAddTime("10:00"); }}
                                title="この会員の予約を追加"
                                className="mx-auto block rounded border border-dashed border-slate-200 px-2 py-1 text-[13px] leading-none text-slate-300 hover:border-emerald-400 hover:text-emerald-600 active:bg-emerald-50"
                              >
                                ＋
                              </button>
                            )}
                          </td>
                        );
                        firstEmpty = false;
                        stamp++;
                      }
                      return cells;
                    })()}
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
        「パーソナル回数券対象」メニューの予約が、患者名で自動的にここに並びます。各回のマスを<b>タップで終了</b>すると
        <b>消費（30分=1回・60分=2回）＋本人へLINE（残り回数）</b>を送信します。<b>残</b>＝回数 − 終了済みの消費。
        未登録の方が予約すると自動で行が作られ、担当・有効期限（初回＋5ヶ月）も自動で入ります。
        各回のマスをタップすると<b>氏名・日付・時刻の編集や終了</b>ができます（同姓同名・兄弟の付け替えに）。
        残の下の<span className="font-bold text-amber-600">◀ N ▶</span>で、前システム・前月からの繰越ぶん予約を右へスライドできます。
        <b>▶を押すごとに左のマスが「✕」（消費済み）</b>になり、来院は次の回から並びます（残回数と終了通知も合います）。◀で戻せます。
        空マスの<b>「＋」</b>で、その会員の予約をすぐ追加できます。
        回数券は<b>10スタンプ</b>（60分=2スタンプ）。使い切って<b>11回目</b>になると、
        その会員の<b>2枚目の回数券が自動で下の段に追加</b>されます（11列目は作りません）。
      </p>

      {add && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" onClick={() => setAdd(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">パーソナル予約を追加</h2>
              <button onClick={() => setAdd(null)} className="text-slate-400">✕</button>
            </div>
            <div className="mb-3">
              <label className="mb-1 block text-xs font-bold text-slate-600">会員名</label>
              <input list="personal-member-names" value={add.name} onChange={(e) => setAdd({ name: e.target.value })}
                placeholder="会員名を選択／入力" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <datalist id="personal-member-names">
                {rows.map((r) => <option key={r.id} value={r.name} />)}
              </datalist>
            </div>
            {personalSvcList.length === 0 ? (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">パーソナルのメニューが未設定です。施術メニュー管理で「パーソナル30分／60分」を作り「パーソナル回数券」にチェックしてください。</p>
            ) : (
              <div className="space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">メニュー（30分=1回・60分=2回消費）</label>
                  <select value={addSvc} onChange={(e) => setAddSvc(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm">
                    {personalSvcList.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold text-slate-600">担当</label>
                  <select value={addStaff ?? ""} onChange={(e) => setAddStaff(e.target.value || null)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm">
                    <option value="">選択…</option>
                    {staff.map((s) => <option key={s.id} value={s.id}>{s.display_name || s.name}</option>)}
                  </select>
                </div>
                <div className="flex gap-2">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-bold text-slate-600">日付</label>
                    <input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" />
                  </div>
                  <div className="w-28">
                    <label className="mb-1 block text-xs font-bold text-slate-600">時刻</label>
                    <input type="time" step={300} value={addTime} onChange={(e) => setAddTime(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" />
                  </div>
                </div>
                <p className="text-[11px] text-slate-400">カレンダー・ボードにも反映されます。終了時に回数券から消費されます。</p>
              </div>
            )}
            <div className="mt-4 flex items-center gap-2">
              <button onClick={() => setAdd(null)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-600 active:bg-slate-100">閉じる</button>
              {personalSvcList.length > 0 && (
                <button onClick={bookVisit} disabled={adding} className="ml-auto rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white active:bg-blue-700 disabled:bg-slate-300">
                  {adding ? "予約中…" : "予約する"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {ev && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" onClick={() => setEv(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">来院の編集{ev.done ? "（終了済み）" : ""}</h2>
              <button onClick={() => setEv(null)} className="text-slate-400">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-xs font-bold text-slate-600">氏名</label>
                <input value={ev.name} onChange={(e) => setEv({ ...ev, name: e.target.value })}
                  placeholder="氏名" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
                <p className="mt-1 text-[11px] text-slate-400">氏名を直すと、その来院は正しい人の回数券へ移ります。</p>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <label className="mb-1 block text-xs font-bold text-slate-600">日付</label>
                  <input type="date" value={ev.date} onChange={(e) => setEv({ ...ev, date: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" />
                </div>
                <div className="w-28">
                  <label className="mb-1 block text-xs font-bold text-slate-600">時刻</label>
                  <input type="time" step={300} value={ev.time} onChange={(e) => setEv({ ...ev, time: e.target.value })}
                    className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" />
                </div>
              </div>
            </div>
            <div className="mt-4 flex items-center gap-2">
              {!ev.done && (
                <button onClick={finishFromPopup}
                  className="rounded-lg bg-green-600 px-3 py-2 text-sm font-bold text-white active:bg-green-700 disabled:bg-slate-300">
                  終了＋LINE
                </button>
              )}
              <button onClick={saveVisit} className="ml-auto rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white active:bg-blue-700">
                保存
              </button>
            </div>
          </div>
        </div>
      )}

      {sendMsg && (
        <SendMessageModal
          title={sendMsg.title}
          endpoint={sendMsg.endpoint}
          payload={sendMsg.payload}
          note={sendMsg.note}
          sendLabel="終了＋送信"
          onClose={() => setSendMsg(null)}
          onSent={async () => { await sendMsg.afterSend?.(); }}
        />
      )}
    </div>
  );
}
