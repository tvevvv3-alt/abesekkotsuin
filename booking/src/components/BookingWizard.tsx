"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  loadAllStaff,
  loadAppointmentSteps,
  loadBookingWindows,
  loadClosures,
  loadEquipment,
  loadSchedules,
  loadServicePrices,
  loadServices,
  loadSettings,
  loadStaffServices,
} from "@/lib/data";
import type {
  AppointmentStep,
  BookingWindow,
  Closure,
  Equipment,
  SavedPatient,
  ServicePrice,
  ServiceWithSteps,
  Settings,
  Staff,
  StaffSchedule,
} from "@/lib/types";
import {
  addDays,
  fromDateStr,
  isMonthOpen,
  minToLabel,
  monthKey,
  startOfWeek,
  toDateStr,
  totalDuration,
  WEEKDAY_LABELS,
} from "@/lib/booking";
import WeekCalendar from "./WeekCalendar";

const STORAGE_KEY = "abe_booking_patient";

type Step = 1 | 2 | 3 | 4 | 5;

// 院（拠点）。川西整体院メニューだけ川西、それ以外は茨木本院。
type ClinicId = "" | "ibaraki" | "kawanishi";
const CLINICS: { id: Exclude<ClinicId, "">; name: string; sub: string; icon: string }[] = [
  { id: "ibaraki", name: "茨木本院", sub: "接骨・鍼灸・全身通電・体幹教室", icon: "🏥" },
  { id: "kawanishi", name: "川西整体院", sub: "整体（施術50分）", icon: "🌿" },
];

// メニューカードの先頭アイコン
function menuIcon(s: ServiceWithSteps): string {
  if (s.after_hours) return "🌙";
  if (s.capacity > 1) return "🤸"; // 体幹教室など定員制クラス
  if (s.category === "川西整体院") return "🌿";
  if (s.recommended) return "⭐";
  return "💪"; // 通常施術
}

export default function BookingWizard() {
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState<Step>(1);

  // マスタ
  const [services, setServices] = useState<ServiceWithSteps[]>([]);
  const [allStaff, setAllStaff] = useState<Staff[]>([]);
  const [links, setLinks] = useState<{ staff_id: string; service_id: string }[]>([]);
  const [prices, setPrices] = useState<ServicePrice[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [windows, setWindows] = useState<BookingWindow[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [loadingMaster, setLoadingMaster] = useState(true);
  const [masterError, setMasterError] = useState<string | null>(null);

  // 院（拠点）選択。空なら院選択トップを表示。
  const [clinic, setClinic] = useState<ClinicId>("");
  // カテゴリー絞り込み
  const [category, setCategory] = useState<string>("all");

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
  const isClass = !!service && service.capacity > 1; // 体幹教室など定員制クラス
  const afterHours = !!service?.after_hours; // 時間外予約（固定の夜枠のみ）

  // クラスの開始時刻固定（体幹=17:00/18:00/19:30）
  const classStarts = useMemo(() => {
    if (!service?.class_starts) return undefined;
    const arr = service.class_starts
      .split(",")
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => !isNaN(n));
    return arr.length ? arr : undefined;
  }, [service]);

  // 選択メニュー×担当者の料金（初診/再診）
  const selectedPrice = useMemo(() => {
    if (!service || isClass || !staffId) return null;
    return prices.find((p) => p.service_id === service.id && p.staff_id === staffId) || null;
  }, [service, isClass, prices, staffId]);

  // 表示中の週に未公開の月があれば案内を出す
  const publishNotice = useMemo(() => {
    const now = new Date();
    const byM = Object.fromEntries(windows.map((w) => [w.year_month, w]));
    for (let i = 0; i < 7; i++) {
      const ds = toDateStr(addDays(weekStart, i));
      const w = byM[monthKey(ds)];
      if (!isMonthOpen(w, now)) {
        const m = parseInt(monthKey(ds).split("-")[1], 10);
        const openAt = w?.open_at ? new Date(w.open_at) : null;
        return { month: m, openAt };
      }
    }
    return null;
  }, [windows, weekStart]);

  // 患者に見せられるメニュー（公開中）。選択中の院 → カテゴリーで絞り込み。
  const publicServices = useMemo(
    () => services.filter((s) => s.published),
    [services]
  );
  // 院で絞る（川西整体院メニューだけ川西、それ以外は茨木本院）
  const clinicServices = useMemo(() => {
    if (!clinic) return [];
    return publicServices.filter((s) =>
      clinic === "kawanishi"
        ? s.category === "川西整体院"
        : s.category !== "川西整体院"
    );
  }, [publicServices, clinic]);
  const categories = useMemo(() => {
    const set: string[] = [];
    clinicServices.forEach((s) => {
      if (!set.includes(s.category)) set.push(s.category);
    });
    return set;
  }, [clinicServices]);
  const shownServices = useMemo(
    () =>
      category === "all"
        ? clinicServices
        : clinicServices.filter((s) => s.category === category),
    [clinicServices, category]
  );

  // 選択メニューに対応できるスタッフ（患者表示・受付中・在籍中のみ）
  const capableStaff = useMemo(() => {
    if (!service) return [];
    const ids = new Set(
      links.filter((l) => l.service_id === service.id).map((l) => l.staff_id)
    );
    return allStaff.filter(
      (s) =>
        ids.has(s.id) &&
        s.patient_visible &&
        s.bookable &&
        s.status === "active"
    );
  }, [service, links, allStaff]);

  const selectedStaff = allStaff.find((s) => s.id === staffId) || null;

  // ---- マスタ読み込み ----
  useEffect(() => {
    (async () => {
      try {
        const [sv, st, ls, pr, se, bw, eq] = await Promise.all([
          loadServices(supabase),
          loadAllStaff(supabase),
          loadStaffServices(supabase),
          loadServicePrices(supabase),
          loadSettings(supabase),
          loadBookingWindows(supabase),
          loadEquipment(supabase),
        ]);
        setServices(sv);
        setAllStaff(st);
        setLinks(ls);
        setPrices(pr);
        setSettings(se);
        setWindows(bw);
        setEquipment(eq);
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
    setLoadingWeek(true);
    try {
      const [sc, cl, ap] = await Promise.all([
        // クラスは担当者に紐づかないため全担当者の勤務時間（＝営業時間）を使う
        loadSchedules(supabase, isClass ? undefined : staffId),
        loadClosures(supabase, weekDates),
        loadAppointmentSteps(supabase, weekDates),
      ]);
      setSchedules(sc);
      setClosures(cl);
      setApptSteps(ap);
    } finally {
      setLoadingWeek(false);
    }
  }, [supabase, staffId, weekDates, isClass]);

  useEffect(() => {
    if (step === 2) reloadWeek();
  }, [step, reloadWeek]);

  // 担当者を切り替えても画面遷移しない（週データだけ差し替え）
  function pickStaff(id: string) {
    setStaffId(id);
    setSelected(null);
  }

  function pickService(id: string) {
    const svc = services.find((s) => s.id === id);
    if (svc && !svc.new_booking) return; // 新規受付停止メニューは選択不可
    setServiceId(id);
    setSelected(null);
    // 対応できるスタッフの先頭を初期選択（クラスは担当者を使わない）
    const ids = new Set(links.filter((l) => l.service_id === id).map((l) => l.staff_id));
    const first = allStaff.find(
      (s) => ids.has(s.id) && s.patient_visible && s.bookable && s.status === "active"
    );
    setStaffId(first?.id || "");
    setStep(2);
  }

  function onSelectSlot(date: string, startMin: number) {
    setSelected({ date, startMin });
  }

  async function submit() {
    if (!service || !selected) return;
    if (!isClass && !selectedStaff) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const { data, error } = await supabase.rpc("book_appointment", {
        p_service_id: service.id,
        // クラスは担当者に紐づかない
        p_staff_id: isClass ? null : selectedStaff!.id,
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

  // ===== 院選択トップ（ブランド） =====
  if (!clinic) {
    return (
      <div className="mx-auto min-h-screen max-w-md bg-white pb-16 shadow-sm">
        <div className="bg-gradient-to-b from-slate-900 to-slate-700 px-6 pb-10 pt-12 text-center text-white">
          <div className="mx-auto mb-3 inline-flex items-center justify-center rounded-2xl bg-white/10 px-5 py-2 text-2xl font-black tracking-[0.3em]">
            TRA
          </div>
          <h1 className="text-lg font-bold">Total Recovery Station Abe</h1>
          <p className="mt-1 text-xs text-white/70">阿部接骨院 ／ WEB予約</p>
        </div>
        <div className="px-5 py-6">
          <h2 className="mb-3 text-center text-sm font-bold text-slate-700">
            ご予約の院を選んでください
          </h2>
          <div className="space-y-3">
            {CLINICS.map((c) => (
              <button
                key={c.id}
                onClick={() => {
                  setClinic(c.id);
                  setCategory("all");
                }}
                className="flex w-full items-center gap-4 rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition active:scale-[.99] active:bg-slate-50"
              >
                <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-2xl">
                  {c.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-slate-800">{c.name}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{c.sub}</span>
                </span>
                <span className="text-slate-300">›</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }

  const clinicName = CLINICS.find((c) => c.id === clinic)?.name ?? "";

  return (
    <div className="mx-auto min-h-screen max-w-md bg-white pb-24 shadow-sm">
      {/* ヘッダ */}
      <header className="sticky top-0 z-20 border-b bg-white/95 px-4 py-2.5 backdrop-blur">
        <div className="flex items-center justify-center gap-2">
          <span className="rounded-md bg-slate-900 px-1.5 py-0.5 text-[11px] font-black tracking-wider text-white">
            TRA
          </span>
          <h1 className="text-sm font-bold text-slate-800">Total Recovery Station Abe</h1>
        </div>
        <p className="mt-0.5 text-center text-[11px] text-slate-400">
          {clinicName} ／ WEB予約
        </p>
        <StepBar step={step} />
      </header>

      {/* ① メニュー選択 */}
      {step === 1 && (
        <Section
          title="メニューを選ぶ"
          onBack={() => {
            setClinic("");
            setCategory("all");
          }}
        >
          {/* カテゴリー絞り込み */}
          {categories.length > 1 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              <CatBtn on={category === "all"} onClick={() => setCategory("all")}>
                すべて
              </CatBtn>
              {categories.map((c) => (
                <CatBtn key={c} on={category === c} onClick={() => setCategory(c)}>
                  {c}
                </CatBtn>
              ))}
            </div>
          )}
          <div className="space-y-2">
            {shownServices.map((s) => {
              const stopped = !s.new_booking;
              const label = s.patient_name || s.name;
              return (
                <button
                  key={s.id}
                  onClick={() => pickService(s.id)}
                  disabled={stopped}
                  className={`flex w-full items-center gap-3 rounded-xl border p-4 text-left ${
                    stopped
                      ? "cursor-not-allowed border-slate-200 opacity-60"
                      : s.recommended
                        ? "border-blue-500 bg-blue-50/40 ring-1 ring-blue-200 active:bg-slate-50"
                        : "border-slate-200 active:bg-slate-50"
                  }`}
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-xl">
                    {menuIcon(s)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-800">{label}</span>
                      {s.recommended && (
                        <span className="shrink-0 rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          イチオシ
                        </span>
                      )}
                      {stopped && (
                        <span className="shrink-0 rounded-full bg-slate-400 px-2 py-0.5 text-[10px] font-bold text-white">
                          新規受付停止中
                        </span>
                      )}
                    </div>
                    {s.description && (
                      <div className="mt-1 text-xs leading-relaxed text-slate-500">
                        {s.description}
                      </div>
                    )}
                    <div className="mt-1 text-[11px] text-slate-400">
                      所要 約{totalDuration(s.steps)}分
                      {s.capacity > 1 && `・定員${s.capacity}名`}
                    </div>
                  </div>
                  {!stopped && <span className="ml-2 shrink-0 text-slate-300">›</span>}
                </button>
              );
            })}
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
            {service.patient_name || service.name}（所要 約{totalDuration(service.steps)}分）
            {isClass && `・定員${service.capacity}名`}
          </div>

          {/* 担当者ボタン：押しても画面遷移せずカレンダーだけ切替。
              このメニューに対応できるスタッフのみ表示。
              定員制クラス（体幹教室）は担当者を選ばない。 */}
          {isClass ? (
            <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              定員{service.capacity}名のグループレッスンです。空いている時間を選んでください（残り人数を表示）。
            </div>
          ) : capableStaff.length === 0 ? (
            <div className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
              このメニューに対応できる担当者が現在いません。お手数ですがお電話ください。
            </div>
          ) : (
            <div className="mb-3 grid grid-cols-4 gap-2">
              {capableStaff.map((s) => {
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
                    {s.display_name || s.name}
                  </button>
                );
              })}
            </div>
          )}

          {/* 週切替（今週より前へは戻れない） */}
          <div className="mb-2 flex items-center justify-between">
            <button
              onClick={() => setWeekStart(addDays(weekStart, -7))}
              disabled={toDateStr(weekStart) <= toDateStr(startOfWeek(new Date()))}
              className="rounded-md px-3 py-1 text-sm text-slate-600 active:bg-slate-100 disabled:opacity-30"
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

          {publishNotice && (
            <div className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {publishNotice.openAt
                ? `${publishNotice.month}月分の予約は ${publishNotice.openAt.getMonth() + 1}月${publishNotice.openAt.getDate()}日 ${String(
                    publishNotice.openAt.getHours()
                  ).padStart(2, "0")}:${String(publishNotice.openAt.getMinutes()).padStart(2, "0")} から受付開始予定です。`
                : `${publishNotice.month}月分は現在受付停止中です。`}
            </div>
          )}
          {loadingWeek ? (
            <p className="py-8 text-center text-sm text-slate-500">読み込み中…</p>
          ) : (
            <WeekCalendar
              serviceId={service.id}
              serviceSteps={service.steps}
              capacity={service.capacity}
              classStarts={classStarts}
              afterHours={afterHours}
              afterHoursStarts={afterHours ? classStarts : undefined}
              staffId={staffId}
              weekStart={weekStart}
              schedules={schedules}
              closures={closures}
              apptSteps={apptSteps}
              equipment={equipment}
              slotUnit={settings?.slot_unit ?? 30}
              sameDayOk={settings?.same_day_ok ?? true}
              lastAcceptMin={settings?.last_accept_min ?? null}
              windows={windows}
              selected={selected}
              onSelect={onSelectSlot}
            />
          )}

          <p className="mt-2 text-center text-[11px] text-slate-400">
            {isClass
              ? "残○＝空き人数 満＝定員 ×＝休診 ·＝受付時間外"
              : "○＝予約可 ×＝空きなし ·＝受付時間外"}
          </p>

          {selected && (
            <div className="mt-4">
              <div className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
                {formatSelected(selected)}
                {!isClass && selectedStaff
                  ? ` / ${selectedStaff.display_name || selectedStaff.name}`
                  : ""}
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
            <Row label="メニュー" value={service.patient_name || service.name} />
            {!isClass && (
              <Row label="担当" value={selectedStaff?.display_name || selectedStaff?.name || ""} />
            )}
            <Row label="日時" value={formatSelected(selected)} />
            <Row label="お名前" value={name} />
            <Row label="フリガナ" value={kana || "—"} />
            <Row label="生年月日" value={birth || "—"} />
            <Row label="電話番号" value={phone} />
            {selectedPrice &&
              (selectedPrice.initial_price || selectedPrice.repeat_price) && (
                <Row
                  label="料金"
                  value={`初診 ¥${(selectedPrice.initial_price ?? 0).toLocaleString()} / 再診 ¥${(selectedPrice.repeat_price ?? 0).toLocaleString()}`}
                />
              )}
          </dl>

          {/* 来院〜終了の目安（工程の内訳は患者には表示しない）*/}
          <div className="mt-3 flex items-center justify-between rounded-xl bg-blue-50 px-4 py-3 text-sm text-blue-900">
            <span className="font-bold">
              ご来院 {minToLabel(selected.startMin)}
            </span>
            <span className="text-blue-700">
              終了予定 {minToLabel(selected.startMin + totalDuration(service.steps))}
              （約{totalDuration(service.steps)}分）
            </span>
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
              {service.patient_name || service.name}
              {!isClass && selectedStaff
                ? ` / ${selectedStaff.display_name || selectedStaff.name}`
                : ""}
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

function CatBtn({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs font-medium ${
        on ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-600"
      }`}
    >
      {children}
    </button>
  );
}

function formatSelected(sel: { date: string; startMin: number }): string {
  const d = fromDateStr(sel.date);
  return `${d.getMonth() + 1}/${d.getDate()}（${WEEKDAY_LABELS[d.getDay()]}）${minToLabel(
    sel.startMin
  )}`;
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
