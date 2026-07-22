"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  loadAllStaff,
  loadCalendarNotes,
  loadEquipment,
  loadServices,
  loadSettings,
} from "@/lib/data";
import type {
  Appointment,
  AppointmentStep,
  CalendarNote,
  Equipment,
  ServiceWithSteps,
  Settings,
  Staff,
} from "@/lib/types";
import { addDays, minToLabel, toDateStr, WEEKDAY_LABELS } from "@/lib/booking";
import AdminBookingModal from "./AdminBookingModal";

const PX_PER_MIN = 1.05; // 1分あたりの高さ(px)
const GUTTER = 46; // 左の時間軸の幅(px)
const MIN_COL = 138; // 日カラムの最小幅(px)。狭い画面では横スクロールで次の日が出る
const SNAP = 30;
const NOTE_COLORS = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#0ea5e9", "#64748b"];

type ApptWithSteps = Appointment & { steps: AppointmentStep[] };
type Item =
  | { kind: "appt"; s: number; e: number; rank: number; appt: ApptWithSteps }
  | { kind: "note"; s: number; e: number; rank: number; note: CalendarNote };

// 重なりを横に並べる。rank順（スタッフ順）で左→右。
function layoutLanes(items: Item[]): (Item & { lane: number; cols: number })[] {
  const sorted = [...items].sort((a, b) => a.s - b.s || a.e - b.e);
  const out: (Item & { lane: number; cols: number })[] = [];
  let cluster: Item[] = [];
  let clusterEnd = -Infinity;
  const flush = () => {
    const cl = [...cluster].sort((a, b) => a.rank - b.rank || a.s - b.s);
    const laneEnd: number[] = [];
    const placed = cl.map((it) => {
      let lane = laneEnd.findIndex((end) => end <= it.s);
      if (lane === -1) {
        lane = laneEnd.length;
        laneEnd.push(it.e);
      } else laneEnd[lane] = it.e;
      return { ...it, lane, cols: 1 };
    });
    placed.forEach((p) => (p.cols = laneEnd.length));
    out.push(...placed);
    cluster = [];
  };
  for (const it of sorted) {
    if (cluster.length && it.s >= clusterEnd) flush();
    cluster.push(it);
    clusterEnd = Math.max(clusterEnd, it.e);
  }
  if (cluster.length) flush();
  return out;
}

const snap = (m: number) => Math.round(m / SNAP) * SNAP;

export default function CalendarView() {
  const supabase = useMemo(() => createClient(), []);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<ServiceWithSteps[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [appts, setAppts] = useState<ApptWithSteps[]>([]);
  const [notes, setNotes] = useState<CalendarNote[]>([]);
  const [days, setDays] = useState(4);
  const [start, setStart] = useState<string>(toDateStr(new Date()));

  const [modal, setModal] = useState<
    | { mode: "add"; date: string; startMin: number }
    | { mode: "edit"; appt: ApptWithSteps }
    | null
  >(null);
  const [noteModal, setNoteModal] = useState<
    | { mode: "add"; date: string; allDay: boolean; startMin: number }
    | { mode: "edit"; note: CalendarNote }
    | null
  >(null);
  const [pop, setPop] = useState<{ date: string; startMin: number; x: number; y: number } | null>(
    null
  );

  useEffect(() => {
    (async () => {
      const [st, sv, eq, se] = await Promise.all([
        loadAllStaff(supabase),
        loadServices(supabase),
        loadEquipment(supabase),
        loadSettings(supabase),
      ]);
      setStaff(st.filter((s) => s.admin_visible && s.status !== "retired"));
      setServices(sv);
      setEquipment(eq);
      setSettings(se);
    })();
  }, [supabase]);

  const dateList = useMemo(() => {
    const [y, m, d] = start.split("-").map(Number);
    const base = new Date(y, m - 1, d);
    return Array.from({ length: days }, (_, i) => toDateStr(addDays(base, i)));
  }, [start, days]);

  const reload = useCallback(async () => {
    if (dateList.length === 0) return;
    const [{ data: aData }, { data: sData }, nt] = await Promise.all([
      supabase.from("appointments").select("*").in("date", dateList).eq("status", "booked"),
      supabase.from("appointment_steps").select("*").in("date", dateList),
      loadCalendarNotes(supabase, dateList),
    ]);
    const stepsByAppt: Record<string, AppointmentStep[]> = {};
    (sData ?? []).forEach((s: AppointmentStep) => {
      (stepsByAppt[s.appointment_id] ||= []).push(s);
    });
    setAppts((aData ?? []).map((a: Appointment) => ({ ...a, steps: stepsByAppt[a.id] || [] })));
    setNotes(nt);
  }, [supabase, dateList]);

  useEffect(() => {
    reload();
  }, [reload]);

  const staffColor = (id: string | null) => staff.find((s) => s.id === id)?.color || "#64748b";
  const staffName = (id: string | null) => staff.find((s) => s.id === id)?.name || "";

  const startMin = settings?.board_start_min ?? 540;
  const endMin = Math.max(startMin + 60, settings?.board_end_min ?? 1290);
  const height = (endMin - startMin) * PX_PER_MIN;
  const yFor = (m: number) => (Math.max(startMin, Math.min(endMin, m)) - startMin) * PX_PER_MIN;

  const hours: number[] = [];
  for (let t = Math.ceil(startMin / 60) * 60; t <= endMin; t += 60) hours.push(t);
  const todayStr = toDateStr(new Date());

  return (
    <div>
      {/* 操作バー */}
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <button
          onClick={() => setStart(toDateStr(addDays(new Date(start + "T00:00:00"), -days)))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 active:bg-slate-100"
        >
          ‹ 前
        </button>
        <button
          onClick={() => setStart(toDateStr(new Date()))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 active:bg-slate-100"
        >
          今日
        </button>
        <button
          onClick={() => setStart(toDateStr(addDays(new Date(start + "T00:00:00"), days)))}
          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-bold text-slate-700 active:bg-slate-100"
        >
          次 ›
        </button>
        <input
          type="date"
          value={start}
          onChange={(e) => e.target.value && setStart(e.target.value)}
          className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
        />
        <div className="ml-auto flex gap-1">
          {[1, 3, 4, 7].map((n) => (
            <button
              key={n}
              onClick={() => setDays(n)}
              className={`rounded-md border px-2.5 py-1 text-xs font-bold ${
                days === n ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 bg-white text-slate-600"
              }`}
            >
              {n}日
            </button>
          ))}
        </div>
      </div>

      {/* カレンダー本体（縦横スクロール・横スクロールで次の日） */}
      <div
        className="overflow-auto rounded-xl border bg-white"
        style={{ maxHeight: "calc(100vh - 150px)" }}
      >
        <div style={{ minWidth: GUTTER + dateList.length * MIN_COL }}>
          {/* 日付ヘッダー＋終日メモ帯（上に固定） */}
          <div className="sticky top-0 z-30 bg-white">
            <div className="flex border-b" style={{ paddingLeft: GUTTER }}>
              {dateList.map((ds) => {
                const dd = new Date(ds + "T00:00:00");
                const isToday = ds === todayStr;
                return (
                  <div
                    key={ds}
                    className={`flex-1 border-l py-1 text-center text-xs font-bold ${
                      isToday ? "text-blue-600" : "text-slate-600"
                    }`}
                    style={{ minWidth: MIN_COL }}
                  >
                    {dd.getMonth() + 1}/{dd.getDate()}（{WEEKDAY_LABELS[dd.getDay()]}）
                  </div>
                );
              })}
            </div>
            {/* 終日メモ帯（受付シフト等）*/}
            <div className="flex border-b bg-slate-50/60" style={{ paddingLeft: GUTTER }}>
              {dateList.map((ds) => {
                const allDay = notes.filter((n) => n.date === ds && n.start_min == null);
                return (
                  <div
                    key={ds}
                    className="flex-1 cursor-pointer border-l p-0.5"
                    style={{ minWidth: MIN_COL, minHeight: 22 }}
                    onClick={(e) => {
                      if (e.target !== e.currentTarget) return;
                      setNoteModal({ mode: "add", date: ds, allDay: true, startMin: startMin });
                    }}
                  >
                    {allDay.map((n) => (
                      <button
                        key={n.id}
                        onClick={() => setNoteModal({ mode: "edit", note: n })}
                        className="mb-0.5 block w-full truncate rounded px-1 py-0.5 text-left text-[10px] font-bold text-white"
                        style={{ backgroundColor: n.color || "#64748b" }}
                      >
                        {n.text}
                      </button>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 時間グリッド */}
          <div className="relative flex" style={{ height }}>
            {/* 左：時間軸（左に固定） */}
            <div className="sticky left-0 z-20 shrink-0 bg-white" style={{ width: GUTTER }}>
              {hours.map((t) => (
                <div
                  key={t}
                  className="absolute right-1 -translate-y-1/2 text-[10px] text-slate-400"
                  style={{ top: yFor(t) }}
                >
                  {minToLabel(t)}
                </div>
              ))}
            </div>

            {dateList.map((ds) => {
              const items: Item[] = [
                ...appts
                  .filter((a) => a.date === ds)
                  .map((a): Item => {
                    const rk = staff.findIndex((s) => s.id === a.staff_id);
                    return {
                      kind: "appt",
                      s: snap(a.start_min),
                      e: Math.max(snap(a.end_min), snap(a.start_min) + SNAP),
                      rank: rk === -1 ? 900 : rk,
                      appt: a,
                    };
                  }),
                ...notes
                  .filter((n) => n.date === ds && n.start_min != null)
                  .map((n): Item => ({
                    kind: "note",
                    s: snap(n.start_min as number),
                    e: Math.max(snap((n.end_min ?? (n.start_min as number) + SNAP)), snap(n.start_min as number) + SNAP),
                    rank: 999,
                    note: n,
                  })),
              ];
              const laid = layoutLanes(items);
              return (
                <div
                  key={ds}
                  className="relative flex-1 border-l"
                  style={{ minWidth: MIN_COL }}
                  onClick={(e) => {
                    if (e.target !== e.currentTarget) return;
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const raw = startMin + (e.clientY - rect.top) / PX_PER_MIN;
                    setPop({ date: ds, startMin: snap(raw), x: e.clientX, y: e.clientY });
                  }}
                >
                  {hours.map((t) => (
                    <div
                      key={t}
                      className="pointer-events-none absolute left-0 w-full border-t border-slate-100"
                      style={{ top: yFor(t) }}
                    />
                  ))}
                  {laid.map((it) => {
                    const top = yFor(it.s);
                    const h = Math.max(16, yFor(it.e) - yFor(it.s) - 1);
                    const w = 100 / it.cols;
                    const style = {
                      top,
                      height: h,
                      left: `calc(${it.lane * w}% + 1px)`,
                      width: `calc(${w}% - 2px)`,
                    };
                    if (it.kind === "note") {
                      return (
                        <button
                          key={it.note.id}
                          onClick={(ev) => {
                            ev.stopPropagation();
                            setNoteModal({ mode: "edit", note: it.note });
                          }}
                          className="absolute overflow-hidden rounded-md px-1 pt-0.5 text-left text-[11px] font-bold leading-tight text-white shadow-sm"
                          style={{ ...style, backgroundColor: it.note.color || "#64748b" }}
                        >
                          <span className="block truncate" style={{ textShadow: "0 1px 2px rgba(0,0,0,.4)" }}>
                            {it.note.text}
                          </span>
                        </button>
                      );
                    }
                    const a = it.appt;
                    return (
                      <button
                        key={a.id}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setModal({ mode: "edit", appt: a });
                        }}
                        className="absolute overflow-hidden rounded-md px-1 pt-0.5 text-left text-[11px] font-bold leading-tight text-white shadow-sm"
                        style={{ ...style, backgroundColor: staffColor(a.staff_id) }}
                        title={`${minToLabel(a.start_min)} ${a.patient_name ?? ""}（${staffName(a.staff_id)}）`}
                      >
                        <span
                          className="block truncate"
                          style={{ textShadow: "0 1px 2px rgba(0,0,0,.4)" }}
                        >
                          {a.patient_name || "（未登録）"}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-slate-400">
        色はスタッフごと。空き時間タップで「予約」か「メモ」、上の帯タップで終日メモ（受付シフト等）を追加できます。
      </p>

      {/* 空きタップ → 予約 or メモ 選択 */}
      {pop && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPop(null)} />
          <div
            className="fixed z-50 w-44 -translate-x-1/2 rounded-xl border bg-white p-2 shadow-xl"
            style={{
              left: Math.min(Math.max(pop.x, 100), window.innerWidth - 100),
              top: Math.min(pop.y + 6, window.innerHeight - 130),
            }}
          >
            <div className="mb-1 text-center text-[11px] text-slate-500">
              {pop.date.slice(5)} {minToLabel(pop.startMin)}
            </div>
            <button
              onClick={() => {
                setModal({ mode: "add", date: pop.date, startMin: pop.startMin });
                setPop(null);
              }}
              className="w-full rounded-lg bg-blue-600 py-2 text-sm font-bold text-white active:bg-blue-700"
            >
              予約を追加
            </button>
            <button
              onClick={() => {
                setNoteModal({ mode: "add", date: pop.date, allDay: false, startMin: pop.startMin });
                setPop(null);
              }}
              className="mt-1.5 w-full rounded-lg border border-slate-300 py-2 text-sm font-bold text-slate-700 active:bg-slate-100"
            >
              メモを追加
            </button>
          </div>
        </>
      )}

      {modal && (
        <AdminBookingModal
          mode={modal.mode}
          appt={modal.mode === "edit" ? modal.appt : undefined}
          initialStartMin={modal.mode === "add" ? modal.startMin : undefined}
          date={modal.mode === "add" ? modal.date : modal.appt.date}
          staff={staff}
          services={services}
          equipment={equipment}
          onClose={() => setModal(null)}
          onDone={() => {
            setModal(null);
            reload();
          }}
        />
      )}

      {noteModal && (
        <NoteModal
          supabase={supabase}
          data={noteModal}
          onClose={() => setNoteModal(null)}
          onDone={() => {
            setNoteModal(null);
            reload();
          }}
        />
      )}
    </div>
  );
}

// ---- メモ（受付シフト・zoom等）の追加・編集 -----------------------------
function NoteModal({
  supabase,
  data,
  onClose,
  onDone,
}: {
  supabase: ReturnType<typeof createClient>;
  data:
    | { mode: "add"; date: string; allDay: boolean; startMin: number }
    | { mode: "edit"; note: CalendarNote };
  onClose: () => void;
  onDone: () => void;
}) {
  const editing = data.mode === "edit" ? data.note : null;
  const [text, setText] = useState(editing?.text ?? "");
  const [color, setColor] = useState(editing?.color ?? NOTE_COLORS[0]);
  const allDay = editing ? editing.start_min == null : data.mode === "add" && data.allDay;
  const initStart = editing?.start_min ?? (data.mode === "add" ? data.startMin : 600);
  const [startMin, setStartMin] = useState<number>(initStart ?? 600);
  const [endMin, setEndMin] = useState<number>(editing?.end_min ?? (initStart ?? 600) + 60);
  const [busy, setBusy] = useState(false);
  const date = editing?.date ?? (data.mode === "add" ? data.date : "");

  async function save() {
    if (!text.trim()) return;
    setBusy(true);
    const row = {
      date,
      text: text.trim(),
      color,
      start_min: allDay ? null : startMin,
      end_min: allDay ? null : Math.max(endMin, startMin + 15),
    };
    if (editing) await supabase.from("calendar_notes").update(row).eq("id", editing.id);
    else await supabase.from("calendar_notes").insert(row);
    setBusy(false);
    onDone();
  }
  async function remove() {
    if (!editing) return;
    if (!confirm("このメモを削除しますか？")) return;
    await supabase.from("calendar_notes").delete().eq("id", editing.id);
    onDone();
  }

  const timeInput = (val: number, set: (n: number) => void) => (
    <input
      type="time"
      step={300}
      value={minToLabel(val)}
      onChange={(e) => {
        const [h, m] = e.target.value.split(":").map(Number);
        if (!isNaN(h)) set(h * 60 + (m || 0));
      }}
      className="rounded-md border px-2 py-1 text-sm"
    />
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-6">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
        <div className="mb-3 text-sm font-bold text-slate-700">
          {editing ? "メモを編集" : allDay ? "終日メモ（受付シフト等）" : "メモを追加"}
        </div>
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="例：受付 上野 16-20 ／ zoom会議 ／ ゴミ捨て"
          className="mb-3 w-full rounded-lg border px-3 py-2 text-sm"
          autoFocus
        />
        {!allDay && (
          <div className="mb-3 flex items-center gap-2 text-sm text-slate-600">
            {timeInput(startMin, setStartMin)}
            <span>〜</span>
            {timeInput(endMin, setEndMin)}
          </div>
        )}
        <div className="mb-4 flex gap-2">
          {NOTE_COLORS.map((c) => (
            <button
              key={c}
              onClick={() => setColor(c)}
              className={`h-7 w-7 rounded-full ${color === c ? "ring-2 ring-offset-2 ring-slate-500" : ""}`}
              style={{ backgroundColor: c }}
            />
          ))}
        </div>
        <div className="flex items-center gap-2">
          {editing && (
            <button onClick={remove} className="rounded-lg px-3 py-2 text-sm font-bold text-red-500">
              削除
            </button>
          )}
          <button onClick={onClose} className="ml-auto rounded-lg border px-4 py-2 text-sm text-slate-600">
            閉じる
          </button>
          <button
            onClick={save}
            disabled={busy || !text.trim()}
            className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white disabled:bg-slate-300"
          >
            保存
          </button>
        </div>
      </div>
    </div>
  );
}
