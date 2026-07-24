"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadServices } from "@/lib/data";
import { minToLabel, toDateStr } from "@/lib/booking";
import type { ServiceWithSteps } from "@/lib/types";

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
        note = j.ok ? "終了＋LINE送信しました" : `終了（LINE未送信: ${j.reason ?? "?"}）`;
      } catch {
        note = "終了（LINE送信エラー）";
      }
    } else {
      note = "終了にしました（LINE未連携）";
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
                    <th className="sticky left-0 z-10 w-[150px] min-w-[150px] max-w-[150px] border-b border-r bg-slate-50 px-2 py-1.5 text-left font-bold">
                      会員
                    </th>
                    {Array.from({ length: maxVisits }).map((_, i) => (
                      <th
                        key={i}
                        className="whitespace-nowrap border-b border-l px-2 py-1.5 text-center font-bold"
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
                    return (
                      <tr key={name} className="border-t">
                        <td className="sticky left-0 z-10 w-[150px] min-w-[150px] max-w-[150px] border-r bg-white px-2 py-1.5 align-top">
                          <div className="truncate text-[13px] font-bold text-slate-800">{name}</div>
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
                          </div>
                          <div className="mt-0.5 flex items-center gap-1 text-[10px] text-slate-500">
                            <label className="flex shrink-0 items-center gap-0.5">
                              <input
                                type="checkbox"
                                checked={purchaseOf(name).purchased}
                                onChange={(e) => togglePurchased(name, e.target.checked)}
                                className="h-3 w-3 accent-blue-600"
                              />
                              購入
                            </label>
                            <input
                              type="date"
                              value={purchaseOf(name).purchase_date ?? ""}
                              onChange={(e) => setPurchaseDate(name, e.target.value)}
                              className="min-w-0 flex-1 rounded border border-slate-300 px-0.5 py-0 text-[9px]"
                            />
                          </div>
                        </td>
                        {Array.from({ length: maxVisits }).map((_, i) => {
                          const v = visits[i];
                          if (!v) return <td key={i} className="border-l px-2 py-2" />;
                          const d = new Date(v.date + "T00:00:00");
                          const done = v.status === "done";
                          return (
                            <td
                              key={i}
                              onClick={() => {
                                if (!done && busy !== v.id && confirm(`${name} を終了＋LINE送信しますか？`))
                                  finish(v);
                              }}
                              className={`whitespace-nowrap border-l px-2 py-1.5 text-center ${
                                done ? "bg-slate-50 text-slate-400" : "cursor-pointer hover:bg-blue-50"
                              }`}
                            >
                              <div className="font-medium text-slate-700">
                                {d.getMonth() + 1}/{d.getDate()}
                              </div>
                              <div className="text-[10px] text-slate-500">{minToLabel(v.start_min)}</div>
                              {done ? (
                                <div className="text-[10px] font-bold">
                                  {v.line_user_id ? "✅" : "済"}
                                </div>
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
      </p>
    </div>
  );
}
