"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  loadAllStaff,
  loadEquipment,
  loadServices,
  loadSettings,
} from "@/lib/data";
import type {
  Appointment,
  AppointmentStep,
  Equipment,
  ServiceWithSteps,
  Settings,
  Staff,
} from "@/lib/types";

type ApptWithSteps = Appointment & { steps: AppointmentStep[] };
import { addDays, minToLabel, toDateStr, WEEKDAY_LABELS } from "@/lib/booking";
import AdminBookingModal from "./AdminBookingModal";

const PX_PER_MIN = 0.9; // 1分あたりの高さ(px)
const GUTTER = 44; // 左の時間軸の幅(px)
const MIN_COL = 120; // 日カラムの最小幅(px)

// 重なる予約を横に並べる（lane=何列目 / cols=同時最大列数）
function layoutLanes<T extends { s: number; e: number }>(
  items: T[]
): (T & { lane: number; cols: number })[] {
  const sorted = [...items].sort((a, b) => a.s - b.s || a.e - b.e);
  const out: (T & { lane: number; cols: number })[] = [];
  let cluster: (T & { lane: number; cols: number })[] = [];
  let clusterEnd = -Infinity;
  const laneEnd: number[] = [];
  const flush = () => {
    const cols = cluster.reduce((m, c) => Math.max(m, c.lane + 1), 0);
    cluster.forEach((c) => (c.cols = cols));
    out.push(...cluster);
    cluster = [];
    laneEnd.length = 0;
  };
  for (const it of sorted) {
    if (cluster.length && it.s >= clusterEnd) flush();
    let lane = laneEnd.findIndex((end) => end <= it.s);
    if (lane === -1) {
      lane = laneEnd.length;
      laneEnd.push(it.e);
    } else laneEnd[lane] = it.e;
    cluster.push({ ...it, lane, cols: 1 });
    clusterEnd = Math.max(clusterEnd, it.e);
  }
  if (cluster.length) flush();
  return out;
}

export default function CalendarView() {
  const supabase = useMemo(() => createClient(), []);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<ServiceWithSteps[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [appts, setAppts] = useState<ApptWithSteps[]>([]);
  const [days, setDays] = useState(4); // 表示日数（1/3/4/7）
  const [start, setStart] = useState<string>(toDateStr(new Date()));
  const [modal, setModal] = useState<
    | { mode: "add"; date: string; startMin: number }
    | { mode: "edit"; appt: ApptWithSteps }
    | null
  >(null);

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
    const [{ data: aData }, { data: sData }] = await Promise.all([
      supabase.from("appointments").select("*").in("date", dateList).eq("status", "booked"),
      supabase.from("appointment_steps").select("*").in("date", dateList),
    ]);
    const stepsByAppt: Record<string, AppointmentStep[]> = {};
    (sData ?? []).forEach((s: AppointmentStep) => {
      (stepsByAppt[s.appointment_id] ||= []).push(s);
    });
    setAppts(
      (aData ?? []).map((a: Appointment) => ({ ...a, steps: stepsByAppt[a.id] || [] }))
    );
  }, [supabase, dateList]);

  useEffect(() => {
    reload();
  }, [reload]);

  const staffColor = (id: string | null) =>
    staff.find((s) => s.id === id)?.color || "#64748b";
  const staffName = (id: string | null) =>
    staff.find((s) => s.id === id)?.name || "";

  // 表示する時間帯（設定のボード範囲、既定 9:00-21:30）
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
                days === n
                  ? "border-blue-600 bg-blue-600 text-white"
                  : "border-slate-300 bg-white text-slate-600"
              }`}
            >
              {n}日
            </button>
          ))}
        </div>
      </div>

      {/* カレンダー本体 */}
      <div className="overflow-x-auto rounded-xl border bg-white">
        <div style={{ minWidth: GUTTER + dateList.length * MIN_COL }}>
          {/* 日付ヘッダー */}
          <div className="flex border-b bg-slate-50" style={{ paddingLeft: GUTTER }}>
            {dateList.map((ds) => {
              const dd = new Date(ds + "T00:00:00");
              const isToday = ds === todayStr;
              return (
                <div
                  key={ds}
                  className={`flex-1 py-1.5 text-center text-xs font-bold ${
                    isToday ? "text-blue-600" : "text-slate-600"
                  }`}
                  style={{ minWidth: MIN_COL }}
                >
                  {dd.getMonth() + 1}/{dd.getDate()}（{WEEKDAY_LABELS[dd.getDay()]}）
                </div>
              );
            })}
          </div>

          {/* 時間グリッド */}
          <div className="relative flex" style={{ height }}>
            {/* 左：時間軸 */}
            <div className="relative shrink-0" style={{ width: GUTTER }}>
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

            {/* 各日カラム */}
            {dateList.map((ds) => {
              const dayItems = appts
                .filter((a) => a.date === ds)
                .map((a) => ({ s: a.start_min, e: Math.max(a.end_min, a.start_min + 15), appt: a }));
              const laid = layoutLanes(dayItems);
              return (
                <div
                  key={ds}
                  className="relative flex-1 border-l"
                  style={{ minWidth: MIN_COL }}
                  onClick={(e) => {
                    // 空き部分のタップ → その時刻で予約追加
                    if (e.target !== e.currentTarget) return;
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    const y = e.clientY - rect.top;
                    const raw = startMin + y / PX_PER_MIN;
                    const snapped = Math.round(raw / 30) * 30;
                    setModal({ mode: "add", date: ds, startMin: snapped });
                  }}
                >
                  {/* 時間線 */}
                  {hours.map((t) => (
                    <div
                      key={t}
                      className="pointer-events-none absolute left-0 w-full border-t border-slate-100"
                      style={{ top: yFor(t) }}
                    />
                  ))}
                  {/* 予約ブロック */}
                  {laid.map(({ appt, s, e, lane, cols }) => {
                    const top = yFor(s);
                    const h = Math.max(16, yFor(e) - yFor(s) - 1);
                    const w = 100 / cols;
                    return (
                      <button
                        key={appt.id}
                        onClick={(ev) => {
                          ev.stopPropagation();
                          setModal({ mode: "edit", appt });
                        }}
                        className="absolute overflow-hidden rounded-md px-1 py-0.5 text-left text-white shadow-sm"
                        style={{
                          top,
                          height: h,
                          left: `calc(${lane * w}% + 1px)`,
                          width: `calc(${w}% - 2px)`,
                          backgroundColor: staffColor(appt.staff_id),
                        }}
                        title={`${minToLabel(appt.start_min)} ${appt.patient_name ?? ""}（${staffName(appt.staff_id)}）`}
                      >
                        <div className="truncate text-[10px] font-bold leading-tight">
                          {minToLabel(appt.start_min)} {appt.patient_name || "（未登録）"}
                        </div>
                        {h > 28 && (
                          <div className="truncate text-[9px] leading-tight opacity-90">
                            {appt.service_name || ""}
                          </div>
                        )}
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
        色はスタッフごと。予約をタップで編集、空き時間をタップでその時刻に追加できます。
      </p>

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
    </div>
  );
}
