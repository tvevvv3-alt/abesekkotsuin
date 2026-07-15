"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  loadEquipment,
  loadSchedules,
  loadServices,
  loadStaff,
} from "@/lib/data";
import type {
  Appointment,
  AppointmentStep,
  Equipment,
  ServiceWithSteps,
  Staff,
  StaffSchedule,
} from "@/lib/types";
import { addDays, minToLabel, toDateStr, WEEKDAY_LABELS } from "@/lib/booking";
import AdminBookingModal from "./AdminBookingModal";

const PX_PER_MIN = 1.4;
const GRID_STEP = 30; // 目盛り（分）

interface ApptWithSteps extends Appointment {
  steps: AppointmentStep[];
}

export default function AdminBoard() {
  const supabase = useMemo(() => createClient(), []);
  const [date, setDate] = useState<string>(toDateStr(new Date()));

  const [staff, setStaff] = useState<Staff[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [services, setServices] = useState<ServiceWithSteps[]>([]);
  const [schedules, setSchedules] = useState<StaffSchedule[]>([]);
  const [appts, setAppts] = useState<ApptWithSteps[]>([]);
  const [loading, setLoading] = useState(true);

  // モーダル：{mode:'add'} or {mode:'edit', appt}
  const [modal, setModal] = useState<
    { mode: "add" } | { mode: "edit"; appt: ApptWithSteps } | null
  >(null);

  // マスタ（初回）
  useEffect(() => {
    (async () => {
      const [st, eq, sv, sc] = await Promise.all([
        loadStaff(supabase),
        loadEquipment(supabase),
        loadServices(supabase),
        loadSchedules(supabase),
      ]);
      setStaff(st);
      setEquipment(eq);
      setServices(sv);
      setSchedules(sc);
    })();
  }, [supabase]);

  const reload = useCallback(async () => {
    setLoading(true);
    const [{ data: aData }, { data: sData }] = await Promise.all([
      supabase
        .from("appointments")
        .select("*")
        .eq("date", date)
        .eq("status", "booked"),
      supabase.from("appointment_steps").select("*").eq("date", date),
    ]);
    const stepsByAppt: Record<string, AppointmentStep[]> = {};
    (sData ?? []).forEach((s: AppointmentStep) => {
      (stepsByAppt[s.appointment_id] ||= []).push(s);
    });
    const merged: ApptWithSteps[] = (aData ?? []).map((a: Appointment) => ({
      ...a,
      steps: (stepsByAppt[a.id] || []).sort((x, y) => x.start_min - y.start_min),
    }));
    setAppts(merged);
    setLoading(false);
  }, [supabase, date]);

  useEffect(() => {
    reload();
  }, [reload]);

  // 表示時間帯（当日の勤務枠の最小〜最大。無ければ 9:00-19:00）
  const weekday = useMemo(() => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d).getDay();
  }, [date]);

  const daySchedules = useMemo(
    () => schedules.filter((s) => s.weekday === weekday),
    [schedules, weekday]
  );

  const [minMin, maxMin] = useMemo(() => {
    if (daySchedules.length === 0) return [540, 1140];
    return [
      Math.min(...daySchedules.map((s) => s.start_min)),
      Math.max(...daySchedules.map((s) => s.end_min)),
    ];
  }, [daySchedules]);

  const height = (maxMin - minMin) * PX_PER_MIN;
  const ticks: number[] = [];
  for (let t = Math.ceil(minMin / GRID_STEP) * GRID_STEP; t <= maxMin; t += GRID_STEP)
    ticks.push(t);

  // 担当者の勤務外/休診を薄いグレーで表現するための helper
  function staffOffRanges(staffId: string): Array<[number, number]> {
    const shifts = daySchedules
      .filter((s) => s.staff_id === staffId)
      .sort((a, b) => a.start_min - b.start_min);
    // 勤務枠の "外" をグレーにする
    const ranges: Array<[number, number]> = [];
    let cursor = minMin;
    for (const s of shifts) {
      if (s.start_min > cursor) ranges.push([cursor, s.start_min]);
      cursor = Math.max(cursor, s.end_min);
    }
    if (cursor < maxMin) ranges.push([cursor, maxMin]);
    if (shifts.length === 0) ranges.push([minMin, maxMin]); // 終日休み
    return ranges;
  }

  // 各担当者のカード（担当者占有区間で配置）
  function staffCards(staffId: string) {
    return appts
      .map((a) => {
        const own = a.steps.filter((s) => s.uses_staff && s.staff_id === staffId);
        if (own.length === 0) return null;
        const s = Math.min(...own.map((x) => x.start_min));
        const e = Math.max(...own.map((x) => x.end_min));
        return { appt: a, s, e };
      })
      .filter(Boolean) as Array<{ appt: ApptWithSteps; s: number; e: number }>;
  }

  // 機器の占有（ハイチャージ等）
  function equipCards(equipId: string) {
    const blocks: Array<{ appt: ApptWithSteps; s: number; e: number; head: number }> = [];
    appts.forEach((a) => {
      a.steps
        .filter((st) => st.equipment_id === equipId)
        .forEach((st) =>
          blocks.push({ appt: a, s: st.start_min, e: st.end_min, head: st.headcount })
        );
    });
    return blocks;
  }

  const dObj = (() => {
    const [y, m, d] = date.split("-").map(Number);
    return new Date(y, m - 1, d);
  })();

  return (
    <div>
      {/* 日付ナビ */}
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setDate(toDateStr(addDays(dObj, -1)))}
            className="rounded-md border bg-white px-3 py-1.5 text-sm active:bg-slate-100"
          >
            ‹ 前日
          </button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border bg-white px-2 py-1.5 text-sm"
          />
          <span className="text-sm font-bold text-slate-700">
            {dObj.getMonth() + 1}/{dObj.getDate()}（{WEEKDAY_LABELS[dObj.getDay()]}）
          </span>
          <button
            onClick={() => setDate(toDateStr(addDays(dObj, 1)))}
            className="rounded-md border bg-white px-3 py-1.5 text-sm active:bg-slate-100"
          >
            翌日 ›
          </button>
          <button
            onClick={() => setDate(toDateStr(new Date()))}
            className="rounded-md px-2 py-1.5 text-sm text-slate-500"
          >
            今日
          </button>
        </div>
        <button
          onClick={() => setModal({ mode: "add" })}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white active:bg-blue-700"
        >
          ＋ 予約追加
        </button>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-500">読み込み中…</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white">
          <div className="flex min-w-[640px]">
            {/* 時間ラベル列 */}
            <div className="w-12 shrink-0 border-r bg-slate-50">
              <div className="h-8 border-b" />
              <div className="relative" style={{ height }}>
                {ticks.map((t) => (
                  <div
                    key={t}
                    className="absolute left-0 w-full pr-1 text-right text-[10px] text-slate-400"
                    style={{ top: (t - minMin) * PX_PER_MIN - 6 }}
                  >
                    {minToLabel(t)}
                  </div>
                ))}
              </div>
            </div>

            {/* 担当者列 */}
            {staff.map((st) => (
              <Column
                key={st.id}
                header={st.name}
                headerColor={st.color || "#334155"}
                height={height}
                minMin={minMin}
                ticks={ticks}
                offRanges={staffOffRanges(st.id)}
              >
                {staffCards(st.id).map(({ appt, s, e }) => (
                  <button
                    key={appt.id}
                    onClick={() => setModal({ mode: "edit", appt })}
                    className="absolute left-0.5 right-0.5 overflow-hidden rounded-md px-1.5 py-1 text-left text-white shadow-sm"
                    style={{
                      top: (s - minMin) * PX_PER_MIN,
                      height: (e - s) * PX_PER_MIN - 2,
                      backgroundColor: st.color || "#334155",
                    }}
                  >
                    <div className="truncate text-xs font-bold">
                      {appt.patient_name || "（未登録）"}
                    </div>
                    <div className="truncate text-[10px] opacity-90">
                      {appt.service_name}
                    </div>
                    <div className="text-[10px] opacity-80">
                      来院 {minToLabel(appt.start_min)}
                    </div>
                  </button>
                ))}
              </Column>
            ))}

            {/* 機器列（ハイチャージ等）*/}
            {equipment.map((eq) => (
              <Column
                key={eq.id}
                header={`${eq.name}`}
                subHeader={`同時${eq.capacity}名`}
                headerColor="#0f172a"
                height={height}
                minMin={minMin}
                ticks={ticks}
                offRanges={[]}
              >
                {equipCards(eq.id).map(({ appt, s, e, head }, i) => (
                  <div
                    key={`${appt.id}-${i}`}
                    className="absolute left-0.5 right-0.5 overflow-hidden rounded-md border border-slate-300 bg-slate-100 px-1 py-0.5 text-left"
                    style={{
                      top: (s - minMin) * PX_PER_MIN,
                      height: (e - s) * PX_PER_MIN - 2,
                    }}
                  >
                    <div className="truncate text-[10px] font-medium text-slate-700">
                      {appt.patient_name}
                    </div>
                    <div className="text-[9px] text-slate-500">
                      {minToLabel(s)}–{minToLabel(e)}
                    </div>
                  </div>
                ))}
              </Column>
            ))}
          </div>
        </div>
      )}

      {modal && (
        <AdminBookingModal
          mode={modal.mode}
          appt={modal.mode === "edit" ? modal.appt : undefined}
          date={date}
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

function Column({
  header,
  subHeader,
  headerColor,
  height,
  minMin,
  ticks,
  offRanges,
  children,
}: {
  header: string;
  subHeader?: string;
  headerColor: string;
  height: number;
  minMin: number;
  ticks: number[];
  offRanges: Array<[number, number]>;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-[110px] flex-1 border-r last:border-r-0">
      <div
        className="flex h-8 flex-col items-center justify-center border-b text-xs font-bold text-white"
        style={{ backgroundColor: headerColor }}
      >
        <span>{header}</span>
        {subHeader && <span className="text-[9px] font-normal opacity-80">{subHeader}</span>}
      </div>
      <div className="relative" style={{ height }}>
        {/* 目盛り線 */}
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute left-0 w-full border-t border-slate-100"
            style={{ top: (t - minMin) * PX_PER_MIN }}
          />
        ))}
        {/* 勤務外/休診グレー */}
        {offRanges.map(([s, e], i) => (
          <div
            key={i}
            className="absolute left-0 w-full bg-slate-200/60"
            style={{ top: (s - minMin) * PX_PER_MIN, height: (e - s) * PX_PER_MIN }}
          />
        ))}
        {children}
      </div>
    </div>
  );
}
