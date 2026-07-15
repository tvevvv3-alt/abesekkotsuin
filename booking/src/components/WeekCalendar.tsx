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
  classSlot,
  isClassService,
  minToLabel,
  timeRows,
  toDateStr,
  WEEKDAY_LABELS,
  type DayContext,
} from "@/lib/booking";

interface Props {
  serviceId: string;
  serviceSteps: ServiceStep[];
  capacity: number; // 1=通常 / 2以上=定員制クラス
  staffId: string;
  weekStart: Date; // 月曜
  schedules: StaffSchedule[]; // 通常=当該担当者 / クラス=全担当者
  closures: Closure[];
  apptSteps: AppointmentStep[];
  equipment: Equipment[];
  selected: { date: string; startMin: number } | null;
  onSelect: (date: string, startMin: number) => void;
}

// セル表示の種類
type Cell =
  | { kind: "off" }
  | { kind: "busy" } // 通常メニューの ×
  | { kind: "ok" } // 通常メニューの ○
  | { kind: "class-ok"; remaining: number }
  | { kind: "class-full" }
  | { kind: "class-closed" };

export default function WeekCalendar({
  serviceId,
  serviceSteps,
  capacity,
  staffId,
  weekStart,
  schedules,
  closures,
  apptSteps,
  equipment,
  selected,
  onSelect,
}: Props) {
  const isClass = isClassService(capacity);

  const equipmentById = useMemo(
    () => Object.fromEntries(equipment.map((e) => [e.id, e])) as Record<string, Equipment>,
    [equipment]
  );

  const days = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const rows = useMemo(() => timeRows(schedules), [schedules]);

  const grid = useMemo(() => {
    return days.map((d) => {
      const dateStr = toDateStr(d);
      const weekday = d.getDay();
      const daySchedules = schedules.filter((s) => s.weekday === weekday);
      const dayClosures = closures.filter((c) => c.date === dateStr);
      const dayApptSteps = apptSteps.filter((a) => a.date === dateStr);

      return rows.map((t): Cell => {
        const inAnyShift = daySchedules.some((s) => s.start_min <= t && s.end_min > t);
        if (!inAnyShift) return { kind: "off" };

        if (isClass) {
          const r = classSlot(
            serviceId,
            capacity,
            serviceSteps,
            t,
            daySchedules,
            dayClosures,
            dayApptSteps
          );
          if (r.state === "off") return { kind: "off" };
          if (r.state === "closed") return { kind: "class-closed" };
          if (r.state === "full") return { kind: "class-full" };
          return { kind: "class-ok", remaining: r.remaining };
        }

        const ctx: DayContext = {
          date: dateStr,
          weekday,
          schedules: daySchedules,
          closures: dayClosures.filter(
            (c) => c.staff_id === null || c.staff_id === staffId
          ),
          staffSteps: dayApptSteps.filter(
            (a) => a.uses_staff && a.staff_id === staffId
          ),
          equipmentSteps: dayApptSteps.filter((a) => a.equipment_id !== null),
          equipmentById,
        };
        const res = checkAvailability(serviceSteps, staffId, t, ctx);
        return res.ok ? { kind: "ok" } : { kind: "busy" };
      });
    });
  }, [
    days,
    rows,
    schedules,
    closures,
    apptSteps,
    staffId,
    serviceId,
    serviceSteps,
    capacity,
    isClass,
    equipmentById,
  ]);

  if (rows.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-slate-500">
        受付時間が設定されていません。
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

                // 予約可能セル（通常○ / クラス残N）
                const clickable = cell.kind === "ok" || cell.kind === "class-ok";
                if (clickable) {
                  const label =
                    cell.kind === "class-ok" ? `残${cell.remaining}` : "○";
                  return (
                    <td key={ds} className="p-0.5">
                      <button
                        type="button"
                        onClick={() => onSelect(ds, t)}
                        className={`flex h-9 w-full items-center justify-center rounded-md font-bold transition ${
                          cell.kind === "class-ok" ? "text-xs" : "text-base"
                        } ${
                          isSel
                            ? "bg-blue-600 text-white"
                            : "bg-blue-50 text-blue-600 active:bg-blue-100"
                        }`}
                      >
                        {label}
                      </button>
                    </td>
                  );
                }

                // 満（クラス）
                if (cell.kind === "class-full") {
                  return (
                    <td key={ds} className="p-0.5">
                      <div className="flex h-9 items-center justify-center rounded-md bg-slate-100 text-xs font-bold text-slate-400">
                        満
                      </div>
                    </td>
                  );
                }

                // × / 休 / 時間外
                const mark =
                  cell.kind === "busy" || cell.kind === "class-closed" ? "×" : "·";
                return (
                  <td key={ds} className="p-0.5">
                    <div className="flex h-9 items-center justify-center text-slate-300">
                      {mark}
                    </div>
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
