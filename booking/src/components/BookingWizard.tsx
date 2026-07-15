"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  loadAppointmentSteps,
  loadClosures,
  loadEquipment,
  loadSchedules,
  loadServices,
  loadStaff,
} from "@/lib/data";
import type {
  AppointmentStep,
  Closure,
  Equipment,
  SavedPatient,
  ServiceWithSteps,
  Staff,
  StaffSchedule,
} from "@/lib/types";
import {
  addDays,
  fromDateStr,
  minToLabel,
  startOfWeek,
  toDateStr,
  totalDuration,
  WEEKDAY_LABELS,
} from "@/lib/booking";
import WeekCalendar from "./WeekCalendar";

const STORAGE_KEY = "abe_booking_patient";

type Step = 1 | 2 | 3 | 4 | 5;

export default function BookingWizard() {
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState<Step>(1);

  // マスタ
  const [services, setServices] = useState<ServiceWithSteps[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loadingMaster, setLoadingMaster] = useState(true);
  const [masterError, setMasterError] = useState<string | null>(null);

  // 選択
  const [serviceId, setServiceId] = useState<string>("");
  const [staffId, setStaffId] = useState<string>("");
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [selected, setSelected] = useState<{ date: string; startMin: number } | null>(null);

  // 週データ
  const [schedules, setSchedules] = useState<StaffSchedule[]>([]);
  const [closures, setClosures] = useState<Closure[]>([]);
  const [apptSteps, setApptSteps] = useState<AppointmentStep[]>([]);
  const [loadingWeek, setLoadingWeek] = useState(false);

  // 患者情報
  const [name, setName] = useState("");
  const [kana, setKana] = useState("");
  const [birth, setBirth] = useState("");
  const [phone, setPhone] = useState("");
  const [isReturning, setIsReturning] = useState(false);

  // 確定
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const service = services.find((s) => s.id === serviceId) || null;
  const selectedStaff = staff.find((s) => s.id === staffId) || null;

  // ---- マスタ読み込み ----
  useEffect(() => {
    (async () => {
      try {
        const [sv, st, eq] = await Promise.all([
          loadServices(supabase),
          loadStaff(supabase),
          loadEquipment(supabase),
        ]);
        setServices(sv);
        setStaff(st);
        setEquipment(eq);
        if (st.length > 0) setStaffId(st[0].id);
      } catch (e) {
        setMasterError(e instanceof Error ? e.message : "読み込みに失敗しました");
      } finally {
        setLoadingMaster(false);
      }
    })();
  }, [supabase]);

  // ---- 端末保存された患者情報を復元（2回目以降の自動入力）----
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p = JSON.parse(raw) as SavedPatient;
        setName(p.name || "");
        setKana(p.name_kana || "");
        setBirth(p.birth_date || "");
        setPhone(p.phone || "");
        setIsReturning(Boolean(p.name));
      }
    } catch {
      /* noop */
    }
  }, []);

  // ---- 週データ読み込み（担当者・週が変わるたび）----
  const weekDates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => toDateStr(addDays(weekStart, i))),
    [weekStart]
  );

  const reloadWeek = useCallback(async () => {
    if (!staffId) return;
    setLoadingWeek(true);
    try {
      const [sc, cl, ap] = await Promise.all([
        loadSchedules(supabase, staffId),
        loadClosures(supabase, weekDates),
        loadAppointmentSteps(supabase, weekDates),
      ]);
      setSchedules(sc);
      setClosures(cl);
      setApptSteps(ap);
    } finally {
      setLoadingWeek(false);
    }
  }, [supabase, staffId, weekDates]);

  useEffect(() => {
    if (step === 2) reloadWeek();
  }, [step, reloadWeek]);

  // 担当者を切り替えても画面遷移しない（週データだけ差し替え）
  function pickStaff(id: string) {
    setStaffId(id);
    setSelected(null);
  }

  function pickService(id: string) {
    setServiceId(id);
    setSelected(null);
    setStep(2);
  }

  function onSelectSlot(date: string, startMin: number) {
    setSelected({ date, startMin });
  }

  async function submit() {
    if (!service || !selectedStaff || !selected) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { data, error } = await supabase.rpc("book_appointment", {
        p_service_id: service.id,
        p_staff_id: selectedStaff.id,
        p_date: selected.date,
        p_start_min: selected.startMin,
        p_name: name.trim(),
        p_name_kana: kana.trim() || null,
        p_birth_date: birth || null,
        p_phone: phone.trim() || null,
        p_note: null,
        p_source: "patient",
      });
      if (error) throw new Error(error.message);
      const res = data as { ok: boolean; reason?: string };
      if (!res.ok) {
        // 直前に他の人が予約したケース等
        setSubmitError(res.reason || "予約できませんでした。別の時間をお選びください。");
        await reloadWeek();
        setStep(2);
        setSelected(null);
        return;
      }
      // 端末に保存（次回自動入力）
      const saved: SavedPatient = {
        name: name.trim(),
        name_kana: kana.trim(),
        birth_date: birth,
        phone: phone.trim(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(saved));
      setStep(5);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : "エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  }

  // ---- 画面 ----
  if (loadingMaster) {
    return <Centered>読み込み中…</Centered>;
  }
  if (masterError) {
    return (
      <Centered>
        <p className="text-red-600">読み込みエラー</p>
        <p className="mt-1 text-xs text-slate-500">{masterError}</p>
      </Centered>
    );
  }

  return (
    <div className="mx-auto min-h-screen max-w-md bg-white pb-24 shadow-sm">
      {/* ヘッダ */}
      <header className="sticky top-0 z-20 border-b bg-white/95 px-4 py-3 backdrop-blur">
        <h1 className="text-center text-base font-bold text-slate-800">
          阿部接骨院 WEB予約
        </h1>
        <StepBar step={step} />
      </header>

      {/* ① メニュー選択 */}
      {step === 1 && (
        <Section title="メニューを選ぶ">
          <div className="space-y-2">
            {services.map((s) => (
              <button
                key={s.id}
                onClick={() => pickService(s.id)}
                className="flex w-full items-center justify-between rounded-xl border border-slate-200 p-4 text-left active:bg-slate-50"
              >
                <div>
                  <div className="font-bold text-slate-800">{s.name}</div>
                  {s.description && (
                    <div className="mt-0.5 text-xs text-slate-500">{s.description}</div>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {s.steps.map((st) => (
                      <span
                        key={st.id}
                        className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600"
                      >
                        {st.name}
                        {st.duration_min}分
                      </span>
                    ))}
                  </div>
                </div>
                <span className="ml-2 shrink-0 text-slate-300">›</span>
              </button>
            ))}
          </div>
        </Section>
      )}

      {/* ② 担当者・日時選択 */}
      {step === 2 && service && (
        <Section
          title="担当者・日時を選ぶ"
          onBack={() => setStep(1)}
        >
          <div className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {service.name}（所要 約{totalDuration(service.steps)}分）
          </div>

          {/* 担当者ボタン：押しても画面遷移せずカレンダーだけ切替 */}
          <div className="mb-3 grid grid-cols-4 gap-2">
            {staff.map((s) => {
              const active = s.id === staffId;
              return (
                <button
                  key={s.id}
                  onClick={() => pickStaff(s.id)}
                  className="rounded-lg py-2 text-sm font-bold text-white transition"
                  style={{
                    backgroundColor: active ? s.color || "#334155" : "#cbd5e1",
                  }}
                >
                  {s.name}
                </button>
              );
            })}
          </div>

          {/* 週切替 */}
          <div className="mb-2 flex items-center justify-between">
            <button
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              className="rounded-md px-3 py-1 text-sm text-slate-600 active:bg-slate-100"
            >
              ‹ 前の週
            </button>
            <span className="text-sm font-medium text-slate-700">
              {weekStart.getMonth() + 1}/{weekStart.getDate()} の週
            </span>
            <button
              onClick={() => setWeekStart(addDays(weekStart, 7))}
              className="rounded-md px-3 py-1 text-sm text-slate-600 active:bg-slate-100"
            >
              次の週 ›
            </button>
          </div>

          {loadingWeek ? (
            <p className="py-8 text-center text-sm text-slate-500">読み込み中…</p>
          ) : (
            <WeekCalendar
              serviceSteps={service.steps}
              staffId={staffId}
              weekStart={weekStart}
              schedules={schedules}
              closures={closures}
              apptSteps={apptSteps}
              equipment={equipment}
              selected={selected}
              onSelect={onSelectSlot}
            />
          )}

          <p className="mt-2 text-center text-[11px] text-slate-400">
            ○＝予約可 ×＝空きなし ·＝受付時間外
          </p>

          {selected && (
            <div className="mt-4">
              <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
                {formatSelected(selected)} / {selectedStaff?.name}
              </div>
              <button
                onClick={() => setStep(3)}
                className="mt-3 w-full rounded-xl bg-blue-600 py-3 font-bold text-white active:bg-blue-700"
              >
                この日時で進む
              </button>
            </div>
          )}
        </Section>
      )}

      {/* ③ 患者情報入力 */}
      {step === 3 && (
        <Section title="お客様情報" onBack={() => setStep(2)}>
          {isReturning && (
            <div className="mb-3 rounded-lg bg-green-50 px-3 py-2 text-xs text-green-700">
              前回の情報を自動入力しました。変更があれば修正してください。
            </div>
          )}
          <div className="space-y-3">
            <Field label="お名前" required>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="山田 太郎"
              />
            </Field>
            <Field label="フリガナ">
              <input
                value={kana}
                onChange={(e) => setKana(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="ヤマダ タロウ"
              />
            </Field>
            <Field label="生年月日">
              <input
                type="date"
                value={birth}
                onChange={(e) => setBirth(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
              />
            </Field>
            <Field label="電話番号" required>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2"
                placeholder="090-1234-5678"
              />
            </Field>
          </div>
          <button
            disabled={!name.trim() || !phone.trim()}
            onClick={() => setStep(4)}
            className="mt-5 w-full rounded-xl bg-blue-600 py-3 font-bold text-white disabled:bg-slate-300"
          >
            確認へ進む
          </button>
        </Section>
      )}

      {/* ④ 確認 */}
      {step === 4 && service && selected && (
        <Section title="ご予約内容の確認" onBack={() => setStep(3)}>
          <dl className="divide-y divide-slate-100 rounded-xl border border-slate-200">
            <Row label="メニュー" value={service.name} />
            <Row label="担当" value={selectedStaff?.name || ""} />
            <Row label="日時" value={formatSelected(selected)} />
            <Row label="お名前" value={name} />
            <Row label="フリガナ" value={kana || "—"} />
            <Row label="生年月日" value={birth || "—"} />
            <Row label="電話番号" value={phone} />
          </dl>

          {/* 工程の内訳 */}
          <div className="mt-3 rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
            <div className="mb-1 font-bold">当日の流れ</div>
            {buildTimeline(service, selected.startMin).map((t, i) => (
              <div key={i} className="flex justify-between py-0.5">
                <span>
                  {minToLabel(t.start)}–{minToLabel(t.end)}
                </span>
                <span>
                  {t.name}
                  {t.usesStaff ? "（担当者）" : t.equipment ? "（機器）" : ""}
                </span>
              </div>
            ))}
          </div>

          {submitError && (
            <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              {submitError}
            </p>
          )}

          <button
            disabled={submitting}
            onClick={submit}
            className="mt-5 w-full rounded-xl bg-blue-600 py-3 font-bold text-white disabled:bg-slate-300"
          >
            {submitting ? "予約中…" : "この内容で予約する"}
          </button>
        </Section>
      )}

      {/* ⑤ 完了 */}
      {step === 5 && service && selected && (
        <Section title="">
          <div className="py-6 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-600">
              ✓
            </div>
            <h2 className="text-lg font-bold text-slate-800">予約が完了しました</h2>
            <p className="mt-2 text-sm text-slate-600">
              {formatSelected(selected)}
              <br />
              {service.name} / {selectedStaff?.name}
            </p>
            <p className="mt-4 text-xs text-slate-400">
              ご来院時刻は {minToLabel(selected.startMin)} です。
            </p>
            <button
              onClick={() => {
                setStep(1);
                setServiceId("");
                setSelected(null);
                setSubmitError(null);
              }}
              className="mt-6 rounded-xl border border-slate-300 px-6 py-2 text-sm font-medium text-slate-700"
            >
              最初に戻る
            </button>
          </div>
        </Section>
      )}
    </div>
  );
}

// ---- 補助表示 ------------------------------------------------------

function formatSelected(sel: { date: string; startMin: number }): string {
  const d = fromDateStr(sel.date);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAY_LABELS[d.getDay()]}）${minToLabel(
    sel.startMin
  )}`;
}

function buildTimeline(service: ServiceWithSteps, startMin: number) {
  let cursor = startMin;
  return service.steps.map((st) => {
    const seg = {
      name: st.name,
      start: cursor,
      end: cursor + st.duration_min,
      usesStaff: st.uses_staff,
      equipment: st.equipment_id,
    };
    cursor += st.duration_min;
    return seg;
  });
}

function StepBar({ step }: { step: Step }) {
  const labels = ["メニュー", "日時", "情報", "確認", "完了"];
  return (
    <div className="mt-2 flex items-center justify-center gap-1">
      {labels.map((l, i) => {
        const n = (i + 1) as Step;
        const done = step >= n;
        return (
          <div key={l} className="flex items-center">
            <div
              className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
                done ? "bg-blue-600 text-white" : "bg-slate-200 text-slate-400"
              }`}
            >
              {n}
            </div>
            {i < labels.length - 1 && (
              <div
                className={`h-0.5 w-4 ${step > n ? "bg-blue-600" : "bg-slate-200"}`}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Section({
  title,
  children,
  onBack,
}: {
  title: string;
  children: React.ReactNode;
  onBack?: () => void;
}) {
  return (
    <section className="px-4 py-4">
      {(title || onBack) && (
        <div className="mb-3 flex items-center gap-2">
          {onBack && (
            <button
              onClick={onBack}
              className="rounded-md px-2 py-1 text-sm text-slate-500 active:bg-slate-100"
            >
              ‹ 戻る
            </button>
          )}
          {title && <h2 className="text-base font-bold text-slate-800">{title}</h2>}
        </div>
      )}
      {children}
    </section>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="ml-1 text-red-500">*</span>}
      </span>
      {children}
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between px-3 py-2 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-8 text-center text-sm text-slate-600">
      <div>{children}</div>
    </div>
  );
}
