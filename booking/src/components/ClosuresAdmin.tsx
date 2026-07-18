"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadServices, loadStaff } from "@/lib/data";
import type { Closure, ServiceWithSteps, Staff } from "@/lib/types";
import { labelToMin, minToLabel, toDateStr, WEEKDAY_LABELS } from "@/lib/booking";

type Repeat = "none" | "weekly" | "biweekly" | "monthly";

// 表示月の6週×7日グリッド（日曜始まり）
function monthCells(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const start = new Date(year, month, 1 - first.getDay());
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return d;
  });
}

export default function ClosuresAdmin() {
  const supabase = useMemo(() => createClient(), []);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [classServices, setClassServices] = useState<ServiceWithSteps[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const [ym, setYm] = useState({ y: now.getFullYear(), m: now.getMonth() });
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // フォーム
  const [target, setTarget] = useState("all"); // all / staff:<id> / service:<id>
  const [allDay, setAllDay] = useState(true);
  const [from, setFrom] = useState("16:00");
  const [to, setTo] = useState("20:30");
  const [repeat, setRepeat] = useState<Repeat>("none");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    const [st, sv, { data }] = await Promise.all([
      loadStaff(supabase, false),
      loadServices(supabase),
      supabase.from("closures").select("*").order("date"),
    ]);
    setStaff(st);
    // メニュー単位で休診にできる対象：体幹教室（定員制）と川西整体院
    setClassServices(
      sv.filter((s) => s.capacity > 1 || s.category === "川西整体院")
    );
    setClosures(data ?? []);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    reload();
  }, [reload]);

  const cells = useMemo(() => monthCells(ym.y, ym.m), [ym]);
  const closuresByDate = useMemo(() => {
    const map: Record<string, Closure[]> = {};
    closures.forEach((c) => (map[c.date] ||= []).push(c));
    return map;
  }, [closures]);

  function toggle(d: Date) {
    const ds = toDateStr(d);
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(ds)) n.delete(ds);
      else n.add(ds);
      return n;
    });
  }

  // 繰り返しでの実日付を展開
  function expandDates(base: string): string[] {
    if (repeat === "none") return [base];
    const out: string[] = [];
    const [y, m, d] = base.split("-").map(Number);
    if (repeat === "monthly") {
      for (let k = 0; k < 6; k++) out.push(toDateStr(new Date(y, m - 1 + k, d)));
    } else {
      const step = repeat === "weekly" ? 7 : 14;
      const start = new Date(y, m - 1, d);
      for (let k = 0; k < 8; k++) {
        const dd = new Date(start);
        dd.setDate(start.getDate() + step * k);
        out.push(toDateStr(dd));
      }
    }
    return out;
  }

  async function register() {
    if (selected.size === 0) return;
    setBusy(true);
    const staff_id = target.startsWith("staff:") ? target.slice(6) : null;
    const service_id = target.startsWith("service:") ? target.slice(8) : null;
    const rows: Omit<Closure, "id">[] = [];
    const seen = new Set<string>();
    for (const base of selected) {
      for (const date of expandDates(base)) {
        const key = `${date}|${target}|${allDay ? "d" : from + to}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          date,
          staff_id,
          service_id,
          start_min: allDay ? null : labelToMin(from),
          end_min: allDay ? null : labelToMin(to),
          reason: reason.trim() || null,
        });
      }
    }
    await supabase.from("closures").insert(rows);
    setBusy(false);
    setSelected(new Set());
    setReason("");
    reload();
  }

  async function remove(id: string) {
    await supabase.from("closures").delete().eq("id", id);
    reload();
  }

  const targetLabel = (c: Closure) =>
    c.service_id
      ? classServices.find((s) => s.id === c.service_id)?.name || "メニュー"
      : c.staff_id
        ? staff.find((s) => s.id === c.staff_id)?.name || "担当者"
        : "院全体";

  const monthName = `${ym.y}年${ym.m + 1}月`;
  const todayStr = toDateStr(now);

  return (
    <div className="max-w-3xl">
      <h1 className="mb-1 text-lg font-bold text-slate-800">休日・休診登録</h1>
      <p className="mb-3 text-xs text-slate-500">
        カレンダーで日付を複数選択し、まとめて休診にできます。ここで登録した休診は日別の予約表にも連動します。
      </p>

      <div className="grid gap-4 md:grid-cols-2">
        {/* 月カレンダー */}
        <div className="rounded-xl border bg-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <button
              onClick={() => setYm((p) => (p.m === 0 ? { y: p.y - 1, m: 11 } : { y: p.y, m: p.m - 1 }))}
              className="rounded-md border px-2 py-1 text-sm"
            >
              ‹
            </button>
            <span className="text-sm font-bold">{monthName}</span>
            <button
              onClick={() => setYm((p) => (p.m === 11 ? { y: p.y + 1, m: 0 } : { y: p.y, m: p.m + 1 }))}
              className="rounded-md border px-2 py-1 text-sm"
            >
              ›
            </button>
          </div>
          <div className="grid grid-cols-7 text-center text-[11px] text-slate-400">
            {WEEKDAY_LABELS.map((w) => (
              <div key={w} className="py-1">
                {w}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {cells.map((d) => {
              const ds = toDateStr(d);
              const inMonth = d.getMonth() === ym.m;
              const isSel = selected.has(ds);
              const has = (closuresByDate[ds] || []).length > 0;
              const isToday = ds === todayStr;
              return (
                <button
                  key={ds}
                  onClick={() => toggle(d)}
                  className={`relative flex h-10 items-center justify-center rounded-md text-sm ${
                    isSel
                      ? "bg-blue-600 font-bold text-white"
                      : inMonth
                        ? "bg-slate-50 text-slate-700 hover:bg-slate-100"
                        : "text-slate-300"
                  } ${isToday && !isSel ? "ring-1 ring-blue-400" : ""}`}
                >
                  {d.getDate()}
                  {has && (
                    <span
                      className={`absolute bottom-1 h-1 w-1 rounded-full ${isSel ? "bg-white" : "bg-rose-500"}`}
                    />
                  )}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-[11px] text-slate-400">
            選択中：{selected.size}日 ・ 赤点＝登録済みの休診あり
          </p>
        </div>

        {/* 設定 */}
        <div className="rounded-xl border bg-white p-3">
          <label className="mb-2 block text-sm">
            <span className="mb-1 block text-xs text-slate-500">対象</span>
            <select value={target} onChange={(e) => setTarget(e.target.value)} className="w-full rounded-md border px-2 py-1.5">
              <option value="all">院全体</option>
              {staff.map((s) => (
                <option key={s.id} value={`staff:${s.id}`}>
                  {s.name}
                </option>
              ))}
              {classServices.map((s) => (
                <option key={s.id} value={`service:${s.id}`}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>

          <label className="mb-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            全日休み
          </label>
          {!allDay && (
            <div className="mb-2 flex items-center gap-2 text-sm">
              <input type="time" step={300} value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-md border px-2 py-1.5" />
              〜
              <input type="time" step={300} value={to} onChange={(e) => setTo(e.target.value)} className="rounded-md border px-2 py-1.5" />
            </div>
          )}

          <label className="mb-2 block text-sm">
            <span className="mb-1 block text-xs text-slate-500">繰り返し</span>
            <select value={repeat} onChange={(e) => setRepeat(e.target.value as Repeat)} className="w-full rounded-md border px-2 py-1.5">
              <option value="none">なし（選択日のみ）</option>
              <option value="weekly">毎週（8週）</option>
              <option value="biweekly">隔週（8回）</option>
              <option value="monthly">毎月（6ヶ月）</option>
            </select>
          </label>

          <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="メモ（任意）" className="mb-3 w-full rounded-md border px-2 py-1.5 text-sm" />

          <button
            onClick={register}
            disabled={busy || selected.size === 0}
            className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white disabled:bg-slate-300"
          >
            {busy ? "登録中…" : `選択した${selected.size}日を休診に登録`}
          </button>
        </div>
      </div>

      {/* 登録済み一覧 */}
      <h2 className="mb-2 mt-5 text-sm font-bold text-slate-600">登録済みの休診</h2>
      {loading ? (
        <p className="text-sm text-slate-500">読み込み中…</p>
      ) : closures.length === 0 ? (
        <p className="text-sm text-slate-400">登録された休診はありません</p>
      ) : (
        <div className="space-y-1.5">
          {closures
            .filter((c) => c.date >= todayStr)
            .map((c) => (
              <div key={c.id} className="flex items-center justify-between rounded-lg border bg-white px-3 py-2 text-sm">
                <div>
                  <span className="font-medium tabnum">{c.date}</span>
                  <span className="ml-2 text-slate-500">{targetLabel(c)}</span>
                  <span className="ml-2 text-xs text-slate-400">
                    {c.start_min === null ? "終日" : `${minToLabel(c.start_min)}–${minToLabel(c.end_min as number)}`}
                    {c.reason && ` / ${c.reason}`}
                  </span>
                </div>
                <button onClick={() => remove(c.id)} className="text-xs text-red-500">
                  削除
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
