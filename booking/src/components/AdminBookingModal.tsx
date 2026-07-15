"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  loadAppointmentSteps,
  loadClosures,
  loadSchedules,
} from "@/lib/data";
import type {
  Appointment,
  AppointmentStep,
  Equipment,
  Patient,
  ServiceWithSteps,
  Staff,
} from "@/lib/types";
import {
  candidateStarts,
  checkAvailability,
  minToLabel,
  toDateStr,
  totalDuration,
  type DayContext,
} from "@/lib/booking";

interface Props {
  mode: "add" | "edit";
  appt?: Appointment & { steps: AppointmentStep[] };
  // 追加モードで担当者・来院時刻をプリセット（予約表のドラッグから）
  initialStaffId?: string;
  initialStartMin?: number;
  date: string;
  staff: Staff[];
  services: ServiceWithSteps[];
  equipment: Equipment[];
  onClose: () => void;
  onDone: () => void;
}

export default function AdminBookingModal({
  mode,
  appt,
  initialStaffId,
  initialStartMin,
  date,
  staff,
  services,
  equipment,
  onClose,
  onDone,
}: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [serviceId, setServiceId] = useState(appt?.service_id || services[0]?.id || "");
  const [staffId, setStaffId] = useState(
    appt?.staff_id || initialStaffId || staff[0]?.id || ""
  );
  const [theDate, setTheDate] = useState(appt?.date || date);
  const [startMin, setStartMin] = useState<number | null>(
    appt?.start_min ?? initialStartMin ?? null
  );

  const [name, setName] = useState(appt?.patient_name || "");
  const [kana, setKana] = useState("");
  const [birth, setBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [note, setNote] = useState(appt?.note || "");

  const [availStarts, setAvailStarts] = useState<number[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 患者検索
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Patient[]>([]);

  const service = services.find((s) => s.id === serviceId) || null;
  const equipmentById = useMemo(
    () => Object.fromEntries(equipment.map((e) => [e.id, e])),
    [equipment]
  );

  // ---- 空き時間を計算 ----
  const recompute = useCallback(async () => {
    if (!service || !staffId) return;
    setLoadingSlots(true);
    try {
      const [sc, cl, ap] = await Promise.all([
        loadSchedules(supabase, staffId),
        loadClosures(supabase, [theDate]),
        loadAppointmentSteps(supabase, [theDate]),
      ]);
      const [y, m, d] = theDate.split("-").map(Number);
      const weekday = new Date(y, m - 1, d).getDay();
      const daySchedules = sc.filter((s) => s.weekday === weekday);
      const ctx: DayContext = {
        date: theDate,
        weekday,
        schedules: daySchedules,
        closures: cl.filter((c) => c.staff_id === null || c.staff_id === staffId),
        staffSteps: ap.filter((a) => a.uses_staff && a.staff_id === staffId),
        equipmentSteps: ap.filter((a) => a.equipment_id !== null),
        equipmentById: equipmentById as Record<string, Equipment>,
      };
      const dur = totalDuration(service.steps);
      const cands = candidateStarts(daySchedules, dur);
      const ok = cands.filter(
        (t) => checkAvailability(service.steps, staffId, t, ctx, appt?.id).ok
      );
      // 編集時、現在の開始時刻が候補に無ければ足す（同一時刻での再保存を許可）
      if (appt && !ok.includes(appt.start_min) && theDate === appt.date && staffId === appt.staff_id) {
        ok.push(appt.start_min);
        ok.sort((a, b) => a - b);
      }
      setAvailStarts(ok);
    } finally {
      setLoadingSlots(false);
    }
  }, [supabase, service, staffId, theDate, equipmentById, appt]);

  useEffect(() => {
    recompute();
    // 条件変更で選択リセット（編集の初期値は維持）
  }, [recompute]);

  async function searchPatients() {
    const term = searchTerm.trim();
    if (!term) return;
    const { data } = await supabase
      .from("patients")
      .select("*")
      .or(`name.ilike.%${term}%,name_kana.ilike.%${term}%,phone.ilike.%${term}%`)
      .limit(10);
    setSearchResults(data ?? []);
  }

  function applyPatient(p: Patient) {
    setName(p.name);
    setKana(p.name_kana || "");
    setBirth(p.birth_date || "");
    setPhone(p.phone || "");
    setSearchResults([]);
    setSearchTerm("");
  }

  async function save() {
    if (!service || !staffId || startMin === null) {
      setError("メニュー・担当者・時間を選択してください");
      return;
    }
    if (mode === "add" && !name.trim()) {
      setError("患者名を入力してください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (mode === "add") {
        const { data, error } = await supabase.rpc("book_appointment", {
          p_service_id: service.id,
          p_staff_id: staffId,
          p_date: theDate,
          p_start_min: startMin,
          p_name: name.trim(),
          p_name_kana: kana.trim() || null,
          p_birth_date: birth || null,
          p_phone: phone.trim() || null,
          p_note: note.trim() || null,
          p_source: "admin",
        });
        if (error) throw new Error(error.message);
        const res = data as { ok: boolean; reason?: string };
        if (!res.ok) {
          setError(res.reason || "予約不可");
          await recompute();
          return;
        }
      } else if (appt) {
        const { data, error } = await supabase.rpc("reschedule_appointment", {
          p_appointment_id: appt.id,
          p_service_id: service.id,
          p_staff_id: staffId,
          p_date: theDate,
          p_start_min: startMin,
          p_note: note.trim() || null,
        });
        if (error) throw new Error(error.message);
        const res = data as { ok: boolean; reason?: string };
        if (!res.ok) {
          setError(res.reason || "変更不可");
          await recompute();
          return;
        }
      }
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラー");
    } finally {
      setBusy(false);
    }
  }

  async function cancelAppt() {
    if (!appt) return;
    if (!confirm("この予約をキャンセルしますか？")) return;
    setBusy(true);
    const { error } = await supabase
      .from("appointments")
      .update({ status: "cancelled" })
      .eq("id", appt.id);
    // 占有ステップも削除して枠を解放
    await supabase.from("appointment_steps").delete().eq("appointment_id", appt.id);
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-800">
            {mode === "add" ? "予約を追加" : "予約を変更"}
          </h2>
          <button onClick={onClose} className="text-slate-400">
            ✕
          </button>
        </div>

        {/* 患者情報 */}
        {mode === "add" ? (
          <div className="mb-3 rounded-lg border p-3">
            <div className="mb-2 flex gap-2">
              <input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="患者検索（氏名・カナ・電話）"
                className="flex-1 rounded-md border px-2 py-1.5 text-sm"
              />
              <button
                onClick={searchPatients}
                className="rounded-md bg-slate-700 px-3 text-sm text-white"
              >
                検索
              </button>
            </div>
            {searchResults.length > 0 && (
              <div className="mb-2 max-h-32 overflow-y-auto rounded-md border">
                {searchResults.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => applyPatient(p)}
                    className="block w-full border-b px-2 py-1.5 text-left text-sm last:border-0 hover:bg-slate-50"
                  >
                    {p.name}{" "}
                    <span className="text-xs text-slate-400">
                      {p.name_kana} {p.phone}
                    </span>
                  </button>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="氏名 *"
                className="rounded-md border px-2 py-1.5 text-sm"
              />
              <input
                value={kana}
                onChange={(e) => setKana(e.target.value)}
                placeholder="フリガナ"
                className="rounded-md border px-2 py-1.5 text-sm"
              />
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="電話番号"
                className="rounded-md border px-2 py-1.5 text-sm"
              />
              <input
                type="date"
                value={birth}
                onChange={(e) => setBirth(e.target.value)}
                className="rounded-md border px-2 py-1.5 text-sm"
              />
            </div>
          </div>
        ) : (
          <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2 text-sm">
            <span className="font-bold">{appt?.patient_name}</span>
            <span className="ml-2 text-xs text-slate-500">の予約</span>
          </div>
        )}

        {/* メニュー */}
        <label className="mb-2 block">
          <span className="mb-1 block text-xs font-medium text-slate-600">メニュー</span>
          <select
            value={serviceId}
            onChange={(e) => {
              setServiceId(e.target.value);
              setStartMin(null);
            }}
            className="w-full rounded-md border px-2 py-1.5 text-sm"
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        {/* 担当者 */}
        <div className="mb-2">
          <span className="mb-1 block text-xs font-medium text-slate-600">担当者</span>
          <div className="grid grid-cols-4 gap-1.5">
            {staff.map((s) => (
              <button
                key={s.id}
                onClick={() => {
                  setStaffId(s.id);
                  setStartMin(null);
                }}
                className="rounded-md py-1.5 text-sm font-bold text-white"
                style={{ backgroundColor: s.id === staffId ? s.color || "#334155" : "#cbd5e1" }}
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>

        {/* 日付 */}
        <label className="mb-2 block">
          <span className="mb-1 block text-xs font-medium text-slate-600">日付</span>
          <input
            type="date"
            value={theDate}
            onChange={(e) => {
              setTheDate(e.target.value);
              setStartMin(null);
            }}
            className="w-full rounded-md border px-2 py-1.5 text-sm"
          />
        </label>

        {/* 時間（空き） */}
        <div className="mb-3">
          <span className="mb-1 block text-xs font-medium text-slate-600">
            来院時刻（空きのみ表示）
          </span>
          {loadingSlots ? (
            <p className="py-2 text-sm text-slate-400">計算中…</p>
          ) : availStarts.length === 0 ? (
            <p className="py-2 text-sm text-slate-400">この日の空きはありません</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {availStarts.map((t) => (
                <button
                  key={t}
                  onClick={() => setStartMin(t)}
                  className={`rounded-md border px-2.5 py-1 text-sm tabnum ${
                    startMin === t
                      ? "border-blue-600 bg-blue-600 text-white"
                      : "border-slate-300 bg-white text-slate-700"
                  }`}
                >
                  {minToLabel(t)}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 工程プレビュー */}
        {service && startMin !== null && (
          <div className="mb-3 rounded-lg bg-slate-50 p-2 text-xs text-slate-600">
            {(() => {
              let cur = startMin;
              return service.steps.map((st) => {
                const seg = (
                  <div key={st.id} className="flex justify-between">
                    <span>
                      {minToLabel(cur)}–{minToLabel(cur + st.duration_min)}
                    </span>
                    <span>
                      {st.name}
                      {st.uses_staff ? "（担当者）" : st.equipment_id ? "（機器）" : ""}
                    </span>
                  </div>
                );
                cur += st.duration_min;
                return seg;
              });
            })()}
          </div>
        )}

        <label className="mb-3 block">
          <span className="mb-1 block text-xs font-medium text-slate-600">メモ</span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-md border px-2 py-1.5 text-sm"
          />
        </label>

        {error && (
          <p className="mb-2 rounded-md bg-red-50 px-2 py-1.5 text-sm text-red-600">{error}</p>
        )}

        <div className="flex gap-2">
          {mode === "edit" && (
            <button
              onClick={cancelAppt}
              disabled={busy}
              className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600"
            >
              キャンセル予約
            </button>
          )}
          <button
            onClick={save}
            disabled={busy || startMin === null}
            className="ml-auto rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white disabled:bg-slate-300"
          >
            {busy ? "保存中…" : mode === "add" ? "予約する" : "変更を保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
