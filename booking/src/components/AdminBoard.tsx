"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  loadAllStaff,
  loadClosures,
  loadEquipment,
  loadSchedules,
  loadServices,
} from "@/lib/data";
import type {
  Appointment,
  AppointmentStep,
  Closure,
  Equipment,
  ServiceWithSteps,
  Staff,
  StaffSchedule,
} from "@/lib/types";
import { addDays, minToLabel, toDateStr, WEEKDAY_LABELS } from "@/lib/booking";
import AdminBookingModal from "./AdminBookingModal";

const PX_PER_MIN = 1.4;
const GRID_STEP = 30; // 目盛り・スナップ（分）

interface ApptWithSteps extends Appointment {
  steps: AppointmentStep[];
}

// 列に描く休診バンド
interface ClosureBand {
  id: string;
  start: number;
  end: number;
  reason: string | null;
}

export default function AdminBoard() {
  const supabase = useMemo(() => createClient(), []);
  const [date, setDate] = useState<string>(toDateStr(new Date()));

  const [staff, setStaff] = useState<Staff[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [services, setServices] = useState<ServiceWithSteps[]>([]);
  const [schedules, setSchedules] = useState<StaffSchedule[]>([]);
  const [appts, setAppts] = useState<ApptWithSteps[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [loading, setLoading] = useState(true);

  // モーダル：追加は担当者・時刻をプリセットできる
  const [modal, setModal] = useState<
    | { mode: "add"; staffId?: string; startMin?: number }
    | { mode: "edit"; appt: ApptWithSteps }
    | null
  >(null);

  // ドラッグ選択の状態
  const [drag, setDrag] = useState<{ staffId: string; a: number; b: number } | null>(null);
  // ドラッグ確定後に出す2択メニュー
  const [pop, setPop] = useState<
    { staffId: string; start: number; end: number; x: number; y: number } | null
  >(null);
  const trackTopRef = useRef(0);

  // マスタ（初回）
  useEffect(() => {
    (async () => {
      const [st, eq, sv, sc] = await Promise.all([
        loadAllStaff(supabase),
        loadEquipment(supabase),
        loadServices(supabase),
        loadSchedules(supabase),
      ]);
      // 管理画面に表示するスタッフ（退職は列から除外、過去予約は保持）
      setStaff(st.filter((s) => s.admin_visible && s.status !== "retired"));
      setEquipment(eq);
      setServices(sv);
      setSchedules(sc);
    })();
  }, [supabase]);

  const reload = useCallback(async () => {
    setLoading(true);
    const [{ data: aData }, { data: sData }, cl] = await Promise.all([
      supabase.from("appointments").select("*").eq("date", date).eq("status", "booked"),
      supabase.from("appointment_steps").select("*").eq("date", date),
      loadClosures(supabase, [date]),
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
    setClosures(cl);
    setLoading(false);
  }, [supabase, date]);

  useEffect(() => {
    reload();
  }, [reload]);

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

  function staffOffRanges(staffId: string): Array<[number, number]> {
    const shifts = daySchedules
      .filter((s) => s.staff_id === staffId)
      .sort((a, b) => a.start_min - b.start_min);
    const ranges: Array<[number, number]> = [];
    let cursor = minMin;
    for (const s of shifts) {
      if (s.start_min > cursor) ranges.push([cursor, s.start_min]);
      cursor = Math.max(cursor, s.end_min);
    }
    if (cursor < maxMin) ranges.push([cursor, maxMin]);
    if (shifts.length === 0) ranges.push([minMin, maxMin]);
    return ranges;
  }

  // 当該担当者に効く休診（院全体 or 個別）をバンド化
  function closureBands(staffId: string): ClosureBand[] {
    return closures
      .filter((c) => c.staff_id === null || c.staff_id === staffId)
      .map((c) => ({
        id: c.id,
        start: c.start_min ?? minMin,
        end: c.end_min ?? maxMin,
        reason: c.reason,
      }));
  }

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

  // 定員制クラス（体幹教室）：同時刻でグループ化して人数を表示
  const classServices = useMemo(
    () => services.filter((s) => s.capacity > 1),
    [services]
  );
  function classGroups(serviceId: string) {
    const map: Record<string, { start: number; end: number; list: ApptWithSteps[] }> = {};
    appts
      .filter((a) => a.service_id === serviceId)
      .forEach((a) => {
        const k = `${a.start_min}-${a.end_min}`;
        (map[k] ||= { start: a.start_min, end: a.end_min, list: [] }).list.push(a);
      });
    return Object.values(map);
  }

  // ---- ドラッグ選択 ----
  const snap = (m: number) => Math.round(m / GRID_STEP) * GRID_STEP;
  const yToMin = (clientY: number) =>
    minMin + (clientY - trackTopRef.current) / PX_PER_MIN;

  function beginDrag(staffId: string, e: React.PointerEvent) {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    trackTopRef.current = rect.top;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const m = snap(yToMin(e.clientY));
    setPop(null);
    setDrag({ staffId, a: m, b: m });
  }
  function moveDrag(e: React.PointerEvent) {
    if (!drag) return;
    const m = snap(yToMin(e.clientY));
    setDrag((d) => (d ? { ...d, b: m } : d));
  }
  function endDrag(e: React.PointerEvent) {
    if (!drag) return;
    const lo = Math.max(minMin, Math.min(drag.a, drag.b));
    let hi = Math.min(maxMin, Math.max(drag.a, drag.b));
    if (hi <= lo) hi = Math.min(maxMin, lo + GRID_STEP); // クリックは30分
    const staffId = drag.staffId;
    setDrag(null);
    setPop({ staffId, start: lo, end: hi, x: e.clientX, y: e.clientY });
  }

  async function makeClosure() {
    if (!pop) return;
    await supabase.from("closures").insert({
      date,
      staff_id: pop.staffId,
      start_min: pop.start,
      end_min: pop.end,
      reason: null,
    });
    setPop(null);
    reload();
  }

  async function removeClosure(id: string) {
    if (!confirm("この休診を解除しますか？")) return;
    await supabase.from("closures").delete().eq("id", id);
    reload();
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

      <p className="mb-2 text-xs text-slate-400">
        空き時間を上下にドラッグ → 「予約を追加」か「休診にする」を選べます。
      </p>

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
            {staff.map((st) => {
              const band =
                drag && drag.staffId === st.id
                  ? ([Math.min(drag.a, drag.b), Math.max(drag.a, drag.b)] as [number, number])
                  : pop && pop.staffId === st.id
                    ? ([pop.start, pop.end] as [number, number])
                    : null;
              return (
                <Column
                  key={st.id}
                  header={st.name}
                  headerColor={st.color || "#334155"}
                  height={height}
                  minMin={minMin}
                  ticks={ticks}
                  offRanges={staffOffRanges(st.id)}
                  closureBands={closureBands(st.id)}
                  onClosureClick={removeClosure}
                  band={band}
                  onPointerDownTrack={(e) => beginDrag(st.id, e)}
                  onPointerMoveTrack={moveDrag}
                  onPointerUpTrack={endDrag}
                >
                  {staffCards(st.id).map(({ appt, s, e }) => (
                    <button
                      key={appt.id}
                      onClick={() => setModal({ mode: "edit", appt })}
                      className="absolute left-0.5 right-0.5 z-20 overflow-hidden rounded-md px-1.5 py-1 text-left text-white shadow-sm"
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
              );
            })}

            {/* 機器列（ハイチャージ等）*/}
            {equipment.filter((eq) => eq.visible).map((eq) => (
              <Column
                key={eq.id}
                header={`${eq.name}`}
                subHeader={`同時${eq.capacity}名`}
                headerColor="#0f172a"
                height={height}
                minMin={minMin}
                ticks={ticks}
                offRanges={[]}
                closureBands={[]}
              >
                {equipCards(eq.id).map(({ appt, s, e }, i) => (
                  <div
                    key={`${appt.id}-${i}`}
                    className="absolute left-0.5 right-0.5 z-20 overflow-hidden rounded-md border border-slate-300 bg-slate-100 px-1 py-0.5 text-left"
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

            {/* 定員制クラス列（体幹教室）：予約人数 N/定員 を表示 */}
            {classServices.map((cls) => (
              <Column
                key={cls.id}
                header={cls.name}
                subHeader={`定員${cls.capacity}名`}
                headerColor="#0f766e"
                height={height}
                minMin={minMin}
                ticks={ticks}
                offRanges={[]}
                closureBands={closures
                  .filter((c) => c.staff_id === null)
                  .map((c) => ({
                    id: c.id,
                    start: c.start_min ?? minMin,
                    end: c.end_min ?? maxMin,
                    reason: c.reason,
                  }))}
                onClosureClick={removeClosure}
              >
                {classGroups(cls.id).map((g, i) => (
                  <div
                    key={i}
                    className="absolute left-0.5 right-0.5 z-20 overflow-hidden rounded-md border border-teal-300 bg-teal-50 px-1 py-1"
                    style={{
                      top: (g.start - minMin) * PX_PER_MIN,
                      height: (g.end - g.start) * PX_PER_MIN - 2,
                    }}
                  >
                    <div className="mb-0.5 text-[11px] font-bold text-teal-800">
                      {g.list.length}/{cls.capacity}
                      {g.list.length >= cls.capacity && (
                        <span className="ml-1 rounded bg-teal-700 px-1 text-[9px] text-white">
                          満
                        </span>
                      )}
                    </div>
                    {g.list.map((a) => (
                      <button
                        key={a.id}
                        onClick={() => setModal({ mode: "edit", appt: a })}
                        className="block w-full truncate text-left text-[10px] text-teal-700 hover:underline"
                      >
                        {a.patient_name || "（未登録）"}
                      </button>
                    ))}
                  </div>
                ))}
              </Column>
            ))}
          </div>
        </div>
      )}

      {/* ドラッグ後の2択ポップアップ */}
      {pop && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setPop(null)} />
          <div
            className="fixed z-50 w-56 -translate-x-1/2 rounded-xl border bg-white p-3 shadow-xl"
            style={{
              left: Math.min(Math.max(pop.x, 130), window.innerWidth - 130),
              top: Math.min(pop.y + 8, window.innerHeight - 150),
            }}
          >
            <div className="mb-2 text-center text-xs text-slate-500">
              {minToLabel(pop.start)}〜{minToLabel(pop.end)} をどうしますか？
            </div>
            <button
              onClick={() => {
                setModal({ mode: "add", staffId: pop.staffId, startMin: pop.start });
                setPop(null);
              }}
              className="mb-2 w-full rounded-lg bg-blue-600 py-2.5 text-sm font-bold text-white active:bg-blue-700"
            >
              予約を追加
            </button>
            <button
              onClick={makeClosure}
              className="w-full rounded-lg border border-slate-300 py-2.5 text-sm font-bold text-slate-700 active:bg-slate-100"
            >
              休診にする
            </button>
          </div>
        </>
      )}

      {modal && (
        <AdminBookingModal
          mode={modal.mode}
          appt={modal.mode === "edit" ? modal.appt : undefined}
          initialStaffId={modal.mode === "add" ? modal.staffId : undefined}
          initialStartMin={modal.mode === "add" ? modal.startMin : undefined}
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
  closureBands,
  onClosureClick,
  band,
  onPointerDownTrack,
  onPointerMoveTrack,
  onPointerUpTrack,
  children,
}: {
  header: string;
  subHeader?: string;
  headerColor: string;
  height: number;
  minMin: number;
  ticks: number[];
  offRanges: Array<[number, number]>;
  closureBands: ClosureBand[];
  onClosureClick?: (id: string) => void;
  band?: [number, number] | null;
  onPointerDownTrack?: (e: React.PointerEvent) => void;
  onPointerMoveTrack?: (e: React.PointerEvent) => void;
  onPointerUpTrack?: (e: React.PointerEvent) => void;
  children: React.ReactNode;
}) {
  const draggable = Boolean(onPointerDownTrack);
  return (
    <div className="min-w-[110px] flex-1 border-r last:border-r-0">
      <div
        className="flex h-8 flex-col items-center justify-center border-b text-xs font-bold text-white"
        style={{ backgroundColor: headerColor }}
      >
        <span>{header}</span>
        {subHeader && <span className="text-[9px] font-normal opacity-80">{subHeader}</span>}
      </div>
      <div className="relative select-none" style={{ height }}>
        {/* 目盛り線 */}
        {ticks.map((t) => (
          <div
            key={t}
            className="absolute left-0 w-full border-t border-slate-100"
            style={{ top: (t - minMin) * PX_PER_MIN }}
          />
        ))}
        {/* 勤務外グレー */}
        {offRanges.map(([s, e], i) => (
          <div
            key={i}
            className="absolute left-0 w-full bg-slate-200/60"
            style={{ top: (s - minMin) * PX_PER_MIN, height: (e - s) * PX_PER_MIN }}
          />
        ))}
        {/* ドラッグ用オーバーレイ（空き部分の入力を拾う。カードは z-20 で上） */}
        {draggable && (
          <div
            className="absolute inset-0 z-0"
            style={{ touchAction: "none" }}
            onPointerDown={onPointerDownTrack}
            onPointerMove={onPointerMoveTrack}
            onPointerUp={onPointerUpTrack}
          />
        )}
        {/* 休診バンド（クリックで解除）*/}
        {closureBands.map((c) => (
          <button
            key={c.id}
            onClick={() => onClosureClick?.(c.id)}
            title="クリックで休診を解除"
            className="absolute left-0 z-10 w-full overflow-hidden border-y border-slate-400/40 bg-slate-400/45 text-[10px] font-bold text-slate-600"
            style={{
              top: (c.start - minMin) * PX_PER_MIN,
              height: (c.end - c.start) * PX_PER_MIN,
              backgroundImage:
                "repeating-linear-gradient(45deg, transparent, transparent 6px, rgba(100,116,139,.15) 6px, rgba(100,116,139,.15) 12px)",
            }}
          >
            休診{c.reason ? `・${c.reason}` : ""}
          </button>
        ))}
        {/* 選択バンド */}
        {band && (
          <div
            className="pointer-events-none absolute left-0 z-10 w-full rounded-sm border-2 border-blue-500 bg-blue-500/25"
            style={{
              top: (band[0] - minMin) * PX_PER_MIN,
              height: Math.max(2, (band[1] - band[0]) * PX_PER_MIN),
            }}
          />
        )}
        {children}
      </div>
    </div>
  );
}
