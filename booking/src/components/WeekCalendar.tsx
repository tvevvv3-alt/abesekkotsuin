"use client";

import { useMemo } from "react";
import type {
  AppointmentStep,
  Closure,
  Equipment,
  ServiceStep,
  StaffSchedule,
} from "@/lib/types";
import {
  addDays,
  checkAvailability,
  minToLabel,
  timeRows,
  toDateStr,
  WEEKDAY_LABELS,
  type DayContext,
} from "@/lib/booking";

interface Props {
  serviceSteps: ServiceStep[];
  staffId: string;
  weekStart: Date; // 月曜
  schedules: StaffSchedule[]; // 当該担当者の全曜日分
  closures: Closure[]; // 週内
  apptSteps: AppointmentStep[]; // 週内
  equipment: Equipment[];
  selected: { date: string; startMin: number } | null;
  onSelect: (date: string, startMin: number) => void;
}

export default function WeekCalendar({
  serviceSteps,
  staffId,
  weekStart,
  schedules,
  closures,
  apptSteps,
  equipment,
  selected,
  onSelect,
}: Props) {
  const equipmentById = useMemo(
    () => Object.fromEntries(equipment.map((e) => [e.id, e])) as Record<string, Equipment>,
    [equipment]
  );

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const rows = useMemo(() => timeRows(schedules), [schedules]);

  // 各セルの可否を事前計算
  const grid = useMemo(() => {
    return days.map((d) => {
      const dateStr = toDateStr(d);
      const weekday = d.getDay();
      const daySchedules = schedules.filter((s) => s.weekday === weekday);
      const ctx: DayContext = {
        date: dateStr,
        weekday,
        schedules: daySchedules,
        closures: closures.filter(
          (c) => c.date === dateStr && (c.staff_id === null || c.staff_id === staffId)
        ),
        staffSteps: apptSteps.filter(
          (a) => a.date === dateStr && a.uses_staff && a.staff_id === staffId
        ),
        equipmentSteps: apptSteps.filter(
          (a) => a.date === dateStr && a.equipment_id !== null
        ),
        equipmentById,
      };
      return rows.map((t) => {
        // 勤務枠がまったく無い時間帯は「-」（休み）
        const inAnyShift = daySchedules.some(
          (s) => s.start_min <= t && s.end_min > t
        );
        if (!inAnyShift) return { t, state: "off" as const };
        const res = checkAvailability(serviceSteps, staffId, t, ctx);
        return { t, state: res.ok ? ("ok" as const) : ("busy" as const) };
      });
    });
  }, [days, rows, schedules, closures, apptSteps, staffId, serviceSteps, equipmentById]);

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        この担当者の勤務時間が未設定です。
      </p>
    );
  }

  const today = toDateStr(new Date());

  return (
    <div className="scroll-x overflow-x-auto">
      <table className="w-full border-collapse text-center tabnum">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-slate-50 p-1 text-xs font-normal text-slate-400">
              時間
            </th>
            {days.map((d) => {
              const ds = toDateStr(d);
              const isToday = ds === today;
              return (
                <th
                  key={ds}
                  className={`min-w-[42px] p-1 text-xs font-medium ${
                    isToday ? "text-blue-600" : "text-slate-600"
                  }`}
                >
                  <div>{WEEKDAY_LABELS[d.getDay()]}</div>
                  <div className={isToday ? "font-bold" : ""}>
                    {d.getMonth() + 1}/{d.getDate()}
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {rows.map((t, ri) => (
            <tr key={t}>
              <td className="sticky left-0 z-10 whitespace-nowrap bg-slate-50 p-1 text-xs text-slate-500">
                {minToLabel(t)}
              </td>
              {days.map((d, di) => {
                const cell = grid[di][ri];
                const ds = toDateStr(d);
                const isSel =
                  selected && selected.date === ds && selected.startMin === t;
                if (cell.state === "off") {
                  return (
                    <td key={ds} className="p-0.5">
                      <div className="flex h-9 items-center justify-center text-slate-300">
                        ·
                      </div>
                    </td>
                  );
                }
                if (cell.state === "busy") {
                  return (
                    <td key={ds} className="p-0.5">
                      <div className="flex h-9 items-center justify-center text-slate-300">
                        ×
                      </div>
                    </td>
                  );
                }
                return (
                  <td key={ds} className="p-0.5">
                    <button
                      type="button"
                      onClick={() => onSelect(ds, t)}
                      className={`flex h-9 w-full items-center justify-center rounded-md text-base font-bold transition ${
                        isSel
                          ? "bg-blue-600 text-white"
                          : "bg-blue-50 text-blue-600 active:bg-blue-100"
                      }`}
                      aria-label={`${ds} ${minToLabel(t)} を予約`}
                    >
                      ○
                    </button>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
