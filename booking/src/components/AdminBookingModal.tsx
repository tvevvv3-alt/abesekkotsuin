"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type {
  Appointment,
  AppointmentStep,
  Equipment,
  Patient,
  ServiceWithSteps,
  Staff,
} from "@/lib/types";
import { minToLabel } from "@/lib/booking";

interface Props {
  mode: "add" | "edit";
  appt?: Appointment & { steps: AppointmentStep[] };
  // 追加モードで担当者・メニュー・来院時刻をプリセット（予約表のドラッグから）
  initialStaffId?: string;
  initialServiceId?: string;
  initialStartMin?: number;
  date: string;
  staff: Staff[];
  services: ServiceWithSteps[];
  equipment: Equipment[];
  onClose: () => void;
  onDone: () => void;
  // 体幹教室の予約から「体幹テスト」（評価入力→LINE送信）を開く
  onCoreTest?: (name: string, lineUserId: string | null) => void;
}

export default function AdminBookingModal({
  mode,
  appt,
  initialStaffId,
  initialServiceId,
  initialStartMin,
  date,
  staff,
  services,
  equipment,
  onClose,
  onDone,
  onCoreTest,
}: Props) {
  const supabase = useMemo(() => createClient(), []);

  const [serviceId, setServiceId] = useState(
    appt?.service_id || initialServiceId || services[0]?.id || ""
  );
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

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 患者検索
  const [searchTerm, setSearchTerm] = useState("");
  const [searchResults, setSearchResults] = useState<Patient[]>([]);

  const service = services.find((s) => s.id === serviceId) || null;
  const isClass = !!service && service.capacity > 1;

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
    if (!service || startMin === null || (!isClass && !staffId)) {
      setError(isClass ? "時間を選択してください" : "メニュー・担当者・時間を選択してください");
      return;
    }
    if (mode === "add" && !name.trim()) {
      setError("患者名を入力してください");
      return;
    }
    // クラスは担当者に紐づかない
    const staffParam = isClass ? null : staffId;
    setBusy(true);
    setError(null);
    try {
      if (mode === "add") {
        const { data, error } = await supabase.rpc("book_appointment", {
          p_service_id: service.id,
          p_staff_id: staffParam,
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
          return;
        }
      } else if (appt) {
        const { data, error } = await supabase.rpc("reschedule_appointment", {
          p_appointment_id: appt.id,
          p_service_id: service.id,
          p_staff_id: staffParam,
          p_date: theDate,
          p_start_min: startMin,
          p_note: note.trim() || null,
        });
        if (error) throw new Error(error.message);
        const res = data as { ok: boolean; reason?: string };
        if (!res.ok) {
          setError(res.reason || "変更不可");
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
    if (!confirm("この予約をキャンセルしますか？（LINE連携の方にはキャンセル通知が届きます）")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/cancel", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: appt.id }),
      });
      const j = (await res.json()) as { ok: boolean; reason?: string };
      if (!j.ok) {
        setError(j.reason === "auth" ? "ログインが必要です" : "キャンセルに失敗しました");
        setBusy(false);
        return;
      }
    } catch {
      setError("通信エラー");
      setBusy(false);
      return;
    }
    setBusy(false);
    onDone();
  }

  // 体幹教室の「終了」→ 予約を終了(done)にし、LINE連携済みならお礼＋次回案内を送信
  async function finishClass() {
    if (!appt) return;
    setBusy(true);
    setError(null);
    await supabase.from("appointments").update({ status: "done" }).eq("id", appt.id);
    try {
      const res = await fetch("/api/class/done", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: appt.id }),
      });
      const j = (await res.json()) as { ok: boolean; reason?: string };
      if (!j.ok && j.reason !== "noline") setError(`LINE未送信: ${j.reason ?? "?"}`);
    } catch {
      setError("LINE送信エラー");
    }
    setBusy(false);
    onDone();
  }

  // 問診票リンクを患者のLINEへ1タップ送信
  async function sendQuestionnaire() {
    if (!appt) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/send-questionnaire", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId: appt.id }),
      });
      const j = (await res.json()) as { ok: boolean; reason?: string };
      if (j.ok) alert("問診票リンクをLINEで送信しました。");
      else if (j.reason === "noline") alert("この患者はLINE未連携のため送信できません。");
      else if (j.reason === "nourl") alert("基本設定で問診票URLを登録してください。");
      else if (j.reason === "notconfigured") alert("LINE送信（アクセストークン）が未設定です。");
      else setError(`問診票を送信できませんでした: ${j.reason ?? "?"}`);
    } catch {
      setError("問診票の送信エラー");
    }
    setBusy(false);
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
            onChange={(e) => setServiceId(e.target.value)}
            className="w-full rounded-md border px-2 py-1.5 text-sm"
          >
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>

        {/* 担当者（定員制クラスは担当者を選ばない）*/}
        {isClass ? (
          <div className="mb-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-700">
            定員{service?.capacity}名のグループレッスンです（担当者の指定なし）。
          </div>
        ) : (
          <div className="mb-2">
            <span className="mb-1 block text-xs font-medium text-slate-600">担当者</span>
            <div className="grid grid-cols-4 gap-1.5">
              {staff.map((s) => (
                <button
                  key={s.id}
                  onClick={() => setStaffId(s.id)}
                  className="rounded-md py-1.5 text-sm font-bold text-white"
                  style={{ backgroundColor: s.id === staffId ? s.color || "#334155" : "#cbd5e1" }}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* 日付 */}
        <label className="mb-2 block">
          <span className="mb-1 block text-xs font-medium text-slate-600">日付</span>
          <input
            type="date"
            value={theDate}
            onChange={(e) => setTheDate(e.target.value)}
            className="w-full rounded-md border px-2 py-1.5 text-sm"
          />
        </label>

        {/* 来院時刻（タップ位置で決定・あとからドラッグで変更可） */}
        <div className="mb-3">
          <span className="mb-1 block text-xs font-medium text-slate-600">来院時刻</span>
          <div className="flex items-center gap-2">
            <input
              type="time"
              step={300}
              value={startMin !== null ? minToLabel(startMin) : ""}
              onChange={(e) => {
                const [h, mm] = e.target.value.split(":").map(Number);
                if (!isNaN(h)) setStartMin(h * 60 + (mm || 0));
              }}
              className="rounded-md border px-2 py-1.5 text-sm tabnum"
            />
            <span className="text-[11px] text-slate-400">時間外もOK・あとからドラッグで変更できます</span>
          </div>
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

        <div className="flex flex-wrap items-center gap-2">
          {mode === "edit" && (
            <button
              onClick={cancelAppt}
              disabled={busy}
              className="rounded-lg border border-red-300 px-3 py-2 text-sm font-medium text-red-600"
            >
              予約をキャンセル
            </button>
          )}
          {mode === "edit" && (
            <button
              onClick={sendQuestionnaire}
              disabled={busy}
              className="rounded-lg border border-emerald-300 px-3 py-2 text-sm font-medium text-emerald-600 active:bg-emerald-50 disabled:opacity-50"
            >
              問診票を送る
            </button>
          )}
          {mode === "edit" && isClass && onCoreTest && appt && (
            <button
              onClick={() =>
                onCoreTest(
                  appt.patient_name || "",
                  (appt as unknown as { line_user_id?: string | null }).line_user_id ?? null
                )
              }
              disabled={busy}
              className="rounded-lg border border-indigo-300 px-3 py-2 text-sm font-bold text-indigo-600 active:bg-indigo-50 disabled:opacity-50"
            >
              📋 体幹テスト
            </button>
          )}
          {mode === "edit" && isClass && (
            <button
              onClick={finishClass}
              disabled={busy}
              className="ml-auto rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white active:bg-green-700 disabled:bg-slate-300"
            >
              {busy ? "処理中…" : "終了＋LINE"}
            </button>
          )}
          <button
            onClick={save}
            disabled={busy || startMin === null}
            className={`${
              mode === "edit" && isClass ? "" : "ml-auto"
            } rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white disabled:bg-slate-300`}
          >
            {busy ? "保存中…" : mode === "add" ? "予約する" : "変更を保存"}
          </button>
        </div>
      </div>
    </div>
  );
}
