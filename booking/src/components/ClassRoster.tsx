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
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const from = useMemo(() => toDateStr(month), [month]);
  const to = useMemo(
    () => toDateStr(new Date(month.getFullYear(), month.getMonth() + 1, 1)),
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
    const [{ data: ap }, { data: mem }] = await Promise.all([
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
    ]);
    setRows((ap as Row[]) ?? []);
    const map: Record<string, Member> = {};
    (mem ?? []).forEach((m: Member) => (map[m.name] = m));
    setMembers(map);
    setLoading(false);
  }, [supabase, classId, from, to]);

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

  async function setPass(name: string, pass_type: PassType) {
    await supabase
      .from("class_members")
      .upsert({ name, pass_type, quota: 4 }, { onConflict: "name" });
    setMembers((m) => ({ ...m, [name]: { name, pass_type, quota: 4 } }));
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
    <div>
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

      {msg && (
        <div className="mb-3 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-700">{msg}</div>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-500">読み込み中…</p>
      ) : groups.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">この月の予約はありません。</p>
      ) : (
        <div className="space-y-3">
          {groups.map(([name, visits]) => {
            const mem = passOf(name);
            const count = visits.length;
            const hasLine = visits.some((v) => v.line_user_id);
            const remainLabel =
              mem.pass_type === "free" ? "フリーパス" : `残り ${Math.max(0, mem.quota - count)}回`;
            return (
              <div key={name} className="overflow-hidden rounded-xl border bg-white">
                <div className="flex flex-wrap items-center gap-2 border-b bg-slate-50 px-4 py-2.5">
                  <span className="text-sm font-bold text-slate-800">{name}</span>
                  {hasLine ? (
                    <span className="rounded bg-green-100 px-1.5 py-0.5 text-[10px] font-bold text-green-700">
                      LINE
                    </span>
                  ) : (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-400">
                      未連携
                    </span>
                  )}
                  <select
                    value={mem.pass_type}
                    onChange={(e) => setPass(name, e.target.value as PassType)}
                    className="rounded-md border border-slate-300 px-1.5 py-1 text-xs"
                  >
                    <option value="month4">月間パス(4回)</option>
                    <option value="free">フリーパス</option>
                  </select>
                  <span className="ml-auto text-sm font-bold text-slate-700">
                    今月 {count}回
                    <span
                      className={`ml-2 text-xs font-bold ${
                        mem.pass_type === "free"
                          ? "text-violet-600"
                          : mem.quota - count <= 0
                          ? "text-red-500"
                          : "text-blue-600"
                      }`}
                    >
                      {remainLabel}
                    </span>
                  </span>
                </div>
                <ul className="divide-y">
                  {visits.map((r, i) => {
                    const d = new Date(r.date + "T00:00:00");
                    return (
                      <li key={r.id} className="flex items-center gap-3 px-4 py-2">
                        <span className="w-6 shrink-0 text-center text-[11px] font-bold text-slate-400">
                          {i + 1}
                        </span>
                        <span className="w-24 shrink-0 text-sm text-slate-600">
                          {d.getMonth() + 1}/{d.getDate()} {minToLabel(r.start_min)}
                        </span>
                        {r.status === "done" ? (
                          <span className="ml-auto text-xs font-bold text-slate-400">
                            {r.line_user_id ? "✅ 送信済" : "済"}
                          </span>
                        ) : (
                          <button
                            onClick={() => finish(r)}
                            disabled={busy === r.id}
                            className="ml-auto rounded-lg bg-blue-600 px-3 py-1 text-xs font-bold text-white active:bg-blue-700 disabled:bg-slate-300"
                          >
                            {busy === r.id ? "処理中…" : "終了＋LINE"}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-400">
        予約が入ると自動で一覧に反映されます。「終了＋LINE」で来場日・今月何回目・残り回数を
        LINEで通知します（フリーパスは無制限）。パス種別は氏名ごとに保存されます。
      </p>
    </div>
  );
}
