"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadServices } from "@/lib/data";
import { minToLabel, toDateStr } from "@/lib/booking";
import type { ServiceWithSteps } from "@/lib/types";
import CoreEvalModal from "@/components/CoreEvalModal";

interface Row {
  id: string;
  date: string;
  start_min: number;
  patient_name: string | null;
  status: "booked" | "cancelled" | "done";
  line_user_id: string | null;
}
type PassType = "month4" | "free";
interface Member {
  name: string;
  pass_type: PassType;
  quota: number;
}

export default function ClassRoster() {
  const supabase = useMemo(() => createClient(), []);
  const [classes, setClasses] = useState<ServiceWithSteps[]>([]);
  const [classId, setClassId] = useState<string>("");
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [rows, setRows] = useState<Row[]>([]);
  const [members, setMembers] = useState<Record<string, Member>>({});
  const [purchases, setPurchases] = useState<
    Record<string, { purchased: boolean; purchase_date: string | null }>
  >({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "month4" | "free">("all");
  const [sort, setSort] = useState<"name" | "date">("name");
  const [evalTarget, setEvalTarget] = useState<{ name: string; lineUserId: string | null } | null>(null);
  const [dragId, setDragId] = useState<string | null>(null); // ドラッグ中の来院ID
  const [overName, setOverName] = useState<string | null>(null); // ドロップ先の会員名
  // 回数券から予約を追加（一番上のボタンから）
  const [addOpen, setAddOpen] = useState(false);
  const [addName, setAddName] = useState("");
  const [addDate, setAddDate] = useState(() => toDateStr(new Date()));
  const [addTime, setAddTime] = useState("17:00");
  const [adding, setAdding] = useState(false);

  async function bookVisit() {
    if (!addName.trim()) { alert("会員名を入力してください"); return; }
    if (!classId) return;
    const [h, m] = addTime.split(":").map((x) => parseInt(x, 10));
    const start = (h || 0) * 60 + (m || 0);
    setAdding(true);
    const { data, error } = await supabase.rpc("book_appointment", {
      p_service_id: classId,
      p_staff_id: null, // 体幹教室は担当なし
      p_date: addDate,
      p_start_min: start,
      p_name: addName.trim(),
      p_source: "admin",
    });
    setAdding(false);
    if (error) { alert("予約できませんでした：\n" + error.message); return; }
    const res = data as { ok: boolean; reason?: string };
    if (!res.ok) { alert(res.reason || "予約できませんでした（満席や休診の可能性）"); return; }
    setAddOpen(false);
    reload();
  }

  // 来院を別の会員へ付け替え（同姓同名・兄弟の付け替え）
  async function reassign(apptId: string, fromName: string, toName: string) {
    if (!apptId || fromName.trim() === toName.trim()) return;
    if (!confirm(`この来院を「${fromName}」→「${toName}」に付け替えますか？`)) return;
    await supabase.from("appointments").update({ patient_name: toName }).eq("id", apptId);
    reload();
  }

  const from = useMemo(() => toDateStr(month), [month]);
  const to = useMemo(
    () => toDateStr(new Date(month.getFullYear(), month.getMonth() + 1, 1)),
    [month]
  );
  const ym = useMemo(
    () => `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}`,
    [month]
  );
  const isThisMonth = useMemo(() => {
    const n = new Date();
    return n.getFullYear() === month.getFullYear() && n.getMonth() === month.getMonth();
  }, [month]);

  useEffect(() => {
    (async () => {
      try {
        const sv = await loadServices(supabase);
        const cls = sv.filter((s) => s.capacity > 1);
        setClasses(cls);
        if (cls[0]) setClassId(cls[0].id);
      } catch {
        /* noop */
      }
    })();
  }, [supabase]);

  const reload = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    const [{ data: ap }, { data: mem }, { data: pur }] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, date, start_min, patient_name, status, line_user_id")
        .eq("service_id", classId)
        .neq("status", "cancelled")
        .gte("date", from)
        .lt("date", to)
        .order("date")
        .order("start_min"),
      supabase.from("class_members").select("name, pass_type, quota"),
      supabase.from("class_purchases").select("name, purchased, purchase_date").eq("ym", ym),
    ]);
    setRows((ap as Row[]) ?? []);
    const map: Record<string, Member> = {};
    (mem ?? []).forEach((m: Member) => (map[m.name] = m));
    setMembers(map);
    const pmap: Record<string, { purchased: boolean; purchase_date: string | null }> = {};
    (pur ?? []).forEach(
      (p: { name: string; purchased: boolean; purchase_date: string | null }) =>
        (pmap[p.name] = { purchased: p.purchased, purchase_date: p.purchase_date })
    );
    setPurchases(pmap);
    setLoading(false);
  }, [supabase, classId, from, to, ym]);

  useEffect(() => {
    reload();
  }, [reload]);

  // 会員（氏名）ごとにまとめる
  const groups = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of rows) {
      const key = (r.patient_name || "（未登録）").trim();
      const arr = map.get(key) ?? [];
      arr.push(r);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0], "ja"));
  }, [rows]);

  function passOf(name: string): Member {
    return members[name] ?? { name, pass_type: "month4", quota: 4 };
  }

  // フィルタ（パス種別）＋並び替え（名前順／来院日順）
  const shown = useMemo(() => {
    const arr = groups.filter(
      ([name]) => filter === "all" || (members[name]?.pass_type ?? "month4") === filter
    );
    if (sort === "name") {
      arr.sort((a, b) => a[0].localeCompare(b[0], "ja"));
    } else {
      // 来院日順：直近の来院日が上（＝当日が最上部）／その日の時間が早い順
      const keyOf = (visits: Row[]) => {
        const latest = visits.reduce((m, v) => (v.date > m ? v.date : m), visits[0].date);
        const t = Math.min(...visits.filter((v) => v.date === latest).map((v) => v.start_min));
        return { latest, t };
      };
      arr.sort((a, b) => {
        const ka = keyOf(a[1]);
        const kb = keyOf(b[1]);
        return kb.latest.localeCompare(ka.latest) || ka.t - kb.t;
      });
    }
    return arr;
  }, [groups, members, filter, sort]);

  async function setPass(name: string, pass_type: PassType) {
    await supabase
      .from("class_members")
      .upsert({ name, pass_type, quota: 4 }, { onConflict: "name" });
    setMembers((m) => ({ ...m, [name]: { name, pass_type, quota: 4 } }));
  }

  function purchaseOf(name: string) {
    return purchases[name] ?? { purchased: false, purchase_date: null };
  }
  async function savePurchase(
    name: string,
    next: { purchased: boolean; purchase_date: string | null }
  ) {
    setPurchases((p) => ({ ...p, [name]: next }));
    await supabase
      .from("class_purchases")
      .upsert(
        { name, ym, purchased: next.purchased, purchase_date: next.purchase_date },
        { onConflict: "name,ym" }
      );
  }
  function togglePurchased(name: string, checked: boolean) {
    const cur = purchaseOf(name);
    savePurchase(name, {
      purchased: checked,
      purchase_date: checked ? cur.purchase_date ?? toDateStr(new Date()) : cur.purchase_date,
    });
  }
  function setPurchaseDate(name: string, date: string) {
    savePurchase(name, { purchased: !!date, purchase_date: date || null });
  }

  async function finish(r: Row) {
    setBusy(r.id);
    setMsg(null);
    const nm = r.patient_name?.trim() || "この方";
    await supabase.from("appointments").update({ status: "done" }).eq("id", r.id);
    let note = "終了にしました";
    if (r.line_user_id) {
      try {
        const res = await fetch("/api/class/done", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ appointmentId: r.id }),
        });
        const j = (await res.json()) as { ok: boolean; reason?: string };
        if (j.ok) {
          note = `${nm}：終了＋LINEを送信しました`;
        } else {
          note = `${nm}：終了しました（LINE送信できませんでした：${j.reason ?? "?"}）`;
          alert(`${nm} を終了しました。\n⚠️ LINE通知は送信できませんでした（${j.reason ?? "エラー"}）。`);
        }
      } catch {
        note = `${nm}：終了しました（LINE送信エラー）`;
        alert(`${nm} を終了しました。\n⚠️ LINE通知の送信中にエラーが発生しました。`);
      }
    } else {
      // LINE未連携（運営側で取った予約など）＝通知は送られない。安心のため明示。
      note = `${nm}：終了しました（LINE未連携のため通知なし）`;
      alert(`${nm} を終了しました。\n📵 この方はLINE未連携のため、通知は送られません。`);
    }
    setBusy(null);
    setMsg(note);
    reload();
  }

  const monthLabel = `${month.getFullYear()}年${month.getMonth() + 1}月`;
  const btn =
    "flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 active:bg-slate-100";

  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800">体幹教室 回数管理</h1>
        <button
          onClick={() => { setAddOpen(true); setAddName(""); setAddDate(toDateStr(new Date())); setAddTime("17:00"); }}
          className="rounded-md bg-emerald-600 px-2.5 py-1 text-[12px] font-bold text-white active:bg-emerald-700"
        >
          ＋ 予約追加
        </button>
        {classes.length > 1 && (
          <select
            value={classId}
            onChange={(e) => setClassId(e.target.value)}
            className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
          >
            {classes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        )}
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}
            className={btn}
            aria-label="前の月"
          >
            ‹
          </button>
          <span className="min-w-[92px] text-center text-sm font-bold text-slate-700">
            {monthLabel}
            {isThisMonth && <span className="ml-1 text-[10px] text-blue-500">今月</span>}
          </span>
          <button
            onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}
            className={btn}
            aria-label="次の月"
          >
            ›
          </button>
        </div>
      </div>

      {/* フィルタ（パス種別）＋並び替え */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
          {([
            ["all", "すべて"],
            ["month4", "月間パス"],
            ["free", "フリーパス"],
          ] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setFilter(v)}
              className={`rounded-md px-2.5 py-1 text-xs font-bold ${
                filter === v ? "bg-blue-600 text-white" : "text-slate-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="ml-auto inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
          {([
            ["name", "名前順"],
            ["date", "来院日順"],
          ] as const).map(([v, label]) => (
            <button
              key={v}
              onClick={() => setSort(v)}
              className={`rounded-md px-2.5 py-1 text-xs font-bold ${
                sort === v ? "bg-slate-700 text-white" : "text-slate-600"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {msg && (
        <div className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">{msg}</div>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-500">読み込み中…</p>
      ) : shown.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">該当する予約はありません。</p>
      ) : (
        (() => {
          const maxVisits = Math.max(1, ...shown.map(([, v]) => v.length));
          return (
            <div className="overflow-x-auto rounded-xl border bg-white">
              <table className="border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500">
                    <th className="sticky left-0 z-10 w-[124px] min-w-[124px] max-w-[124px] border-b border-r bg-slate-50 px-2 py-1 text-left font-bold">
                      会員
                    </th>
                    <th className="whitespace-nowrap border-b border-l px-1 py-1 text-center font-bold">テスト</th>
                    {Array.from({ length: maxVisits }).map((_, i) => (
                      <th
                        key={i}
                        className="whitespace-nowrap border-b border-l px-2 py-1 text-center font-bold"
                      >
                        {i + 1}回目
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map(([name, visits]) => {
                    const mem = passOf(name);
                    const count = visits.length;
                    const pu = purchaseOf(name);
                    return (
                      <tr
                        key={name}
                        className={`border-t ${overName === name && dragId ? "bg-indigo-50" : ""}`}
                        onDragOver={(e) => { if (dragId) { e.preventDefault(); if (overName !== name) setOverName(name); } }}
                        onDragLeave={() => { if (overName === name) setOverName(null); }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const id = e.dataTransfer.getData("apptId");
                          const from = e.dataTransfer.getData("fromName");
                          setOverName(null);
                          setDragId(null);
                          reassign(id, from, name);
                        }}
                      >
                        <td className={`sticky left-0 z-10 w-[124px] min-w-[124px] max-w-[124px] border-r px-1.5 py-1 align-middle ${overName === name && dragId ? "bg-indigo-100" : pu.purchased ? "bg-white" : "bg-rose-50"}`}>
                          <div className="flex items-center gap-1">
                            <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-slate-800">{name}</span>
                            <button
                              type="button"
                              onClick={() => togglePurchased(name, !pu.purchased)}
                              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold ${
                                pu.purchased
                                  ? "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200"
                                  : "bg-red-500 text-white shadow-sm"
                              }`}
                            >
                              {pu.purchased ? "購入済" : "未購入"}
                            </button>
                          </div>
                          <div className="mt-0.5 flex items-center gap-1">
                            <select
                              value={mem.pass_type}
                              onChange={(e) => setPass(name, e.target.value as PassType)}
                              className="rounded border border-slate-300 px-0.5 py-0 text-[10px]"
                            >
                              <option value="month4">月4</option>
                              <option value="free">ﾌﾘｰ</option>
                            </select>
                            <span className="text-[11px] font-bold text-slate-700">{count}</span>
                            <span
                              className={`text-[10px] font-bold ${
                                mem.pass_type === "free"
                                  ? "text-violet-600"
                                  : mem.quota - count <= 0
                                  ? "text-red-500"
                                  : "text-blue-600"
                              }`}
                            >
                              {mem.pass_type === "free" ? "ﾌﾘｰ" : `残${Math.max(0, mem.quota - count)}`}
                            </span>
                            {pu.purchased && (
                              <input
                                type="date"
                                value={pu.purchase_date ?? ""}
                                onChange={(e) => setPurchaseDate(name, e.target.value)}
                                className="min-w-0 flex-1 rounded border border-slate-300 px-0.5 py-0 text-[9px] text-slate-500"
                              />
                            )}
                          </div>
                        </td>
                        <td className="border-l px-1 py-1 text-center align-middle">
                          <button
                            onClick={() =>
                              setEvalTarget({ name, lineUserId: visits.find((v) => v.line_user_id)?.line_user_id ?? null })
                            }
                            className="rounded-md border border-indigo-300 bg-indigo-50 px-1.5 py-1 text-[10px] font-bold leading-tight text-indigo-600 active:bg-indigo-100"
                          >
                            <span className="block">体幹</span>
                            <span className="block">テスト</span>
                          </button>
                        </td>
                        {Array.from({ length: maxVisits }).map((_, i) => {
                          const v = visits[i];
                          if (!v) return <td key={i} className="border-l px-1.5 py-1" />;
                          const d = new Date(v.date + "T00:00:00");
                          const done = v.status === "done";
                          return (
                            <td
                              key={i}
                              draggable
                              onDragStart={(e) => {
                                e.dataTransfer.setData("apptId", v.id);
                                e.dataTransfer.setData("fromName", name);
                                e.dataTransfer.effectAllowed = "move";
                                setDragId(v.id);
                              }}
                              onDragEnd={() => { setDragId(null); setOverName(null); }}
                              onClick={() => {
                                if (done || busy === v.id) return;
                                const ask = v.line_user_id
                                  ? `${name} を終了して、LINEで通知しますか？`
                                  : `${name} を終了しますか？\n（LINE未連携のため通知は送られません）`;
                                if (confirm(ask)) finish(v);
                              }}
                              className={`whitespace-nowrap border-l px-1.5 py-1 text-center align-middle ${
                                done ? "bg-slate-50 text-slate-400" : "cursor-grab hover:bg-blue-50"
                              }`}
                            >
                              <div className="text-[12px] font-medium text-slate-700">
                                {d.getMonth() + 1}/{d.getDate()}
                                <span className="ml-1 text-[10px] text-slate-500">{minToLabel(v.start_min)}</span>
                              </div>
                              {done ? (
                                v.line_user_id ? (
                                  <div className="text-[9px] font-bold text-emerald-600">✅ 通知済</div>
                                ) : (
                                  <div className="text-[9px] font-bold text-slate-400">済・通知なし</div>
                                )
                              ) : (
                                <div className="text-[9px] text-blue-500">タップで終了</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          );
        })()
      )}

      <p className="mt-3 text-[11px] text-slate-400">
        予約が入ると自動で表に反映されます（行＝人・列＝回数）。各回のマスを
        タップすると「終了＋LINE」（来場日・今月何回目・残り回数を通知／フリーは無制限）。
        名前は横スクロールしても固定、パス種別は氏名ごとに保存されます。
        今月チケット未購入の方は<span className="font-bold text-red-500">赤い「未購入」</span>で表示。
        タップで「購入済」に切り替わり（購入日は自動で今日、変更可）、月が変わると再び未購入になります。
        「体幹テスト」から評価を入力してLINE送信できます。
        来院マスを<b>別の会員の行へドラッグ＆ドロップ</b>すると、その来院を付け替えできます（同姓同名・兄弟の付け替えに）。
      </p>

      {evalTarget && (
        <CoreEvalModal name={evalTarget.name} lineUserId={evalTarget.lineUserId} onClose={() => setEvalTarget(null)} />
      )}

      {addOpen && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40 p-4" onClick={() => setAddOpen(false)}>
          <div className="w-full max-w-xs rounded-2xl bg-white p-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800">体幹教室の予約を追加</h2>
              <button onClick={() => setAddOpen(false)} className="text-slate-400">✕</button>
            </div>
            <div className="mb-3">
              <label className="mb-1 block text-xs font-bold text-slate-600">会員名</label>
              <input list="class-member-names" value={addName} onChange={(e) => setAddName(e.target.value)}
                placeholder="会員名を選択／入力" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              <datalist id="class-member-names">
                {shown.map(([n]) => <option key={n} value={n} />)}
              </datalist>
            </div>
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-xs font-bold text-slate-600">日付</label>
                <input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" />
              </div>
              <div className="w-28">
                <label className="mb-1 block text-xs font-bold text-slate-600">時刻</label>
                <input type="time" step={300} value={addTime} onChange={(e) => setAddTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2 py-2 text-sm" />
              </div>
            </div>
            <p className="mt-2 text-[11px] text-slate-400">カレンダー・ボードにも反映されます（定員4名／満席時は入りません）。</p>
            <div className="mt-4 flex items-center gap-2">
              <button onClick={() => setAddOpen(false)} className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-bold text-slate-600 active:bg-slate-100">閉じる</button>
              <button onClick={bookVisit} disabled={adding} className="ml-auto rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white active:bg-blue-700 disabled:bg-slate-300">
                {adding ? "予約中…" : "予約する"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
