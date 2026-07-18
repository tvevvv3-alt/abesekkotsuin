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

// ブランドカラー
const NAVY = "#0f1f40";
const GOLD = "#c9a24b";

// TRA 円形ロゴバッジ（公式ロゴ準拠のSVG再現）
function TraBadge({ size = 168 }: { size?: number }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label="TRA 阿部接骨院 大阪茨木">
      <circle cx="100" cy="100" r="98" fill={NAVY} />
      <circle cx="100" cy="100" r="93" fill="none" stroke={GOLD} strokeWidth="2.5" />
      <text x="100" y="84" textAnchor="middle" fontSize="50" fontWeight="800" fill="#fff" fontFamily="Arial, sans-serif" letterSpacing="1">TR</text>
      <text x="139" y="84" textAnchor="middle" fontSize="50" fontWeight="800" fill="#fff" fontFamily="Arial, sans-serif">A</text>
      <line x1="120" y1="86" x2="150" y2="58" stroke={GOLD} strokeWidth="4.5" strokeLinecap="round" />
      <text x="100" y="103" textAnchor="middle" fontSize="9.6" fill="#fff" fontFamily="Arial, sans-serif" letterSpacing="1.2">TOTAL RECOVERYTATION ABE</text>
      <polyline points="52,119 79,119 85,110 91,130 97,113 103,119 148,119" fill="none" stroke={GOLD} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <text x="100" y="141" textAnchor="middle" fontSize="16.5" fontWeight="700" fill={GOLD} fontFamily="Arial, sans-serif" letterSpacing="2.5">ABESEKKOTSUIN</text>
      <text x="100" y="162" textAnchor="middle" fontSize="17" fontWeight="700" fill="#fff" letterSpacing="4">阿部接骨院</text>
      <text x="100" y="179" textAnchor="middle" fontSize="10" fill={GOLD} letterSpacing="3">大阪茨木</text>
    </svg>
  );
}

// スタッフのアバター（顔写真 or 頭文字）
function StaffAvatar({ staff, size = 60 }: { staff: Staff; size?: number }) {
  if (staff.image_path) {
    return (
      <div
        className="shrink-0 overflow-hidden rounded-full bg-slate-100"
        style={{ width: size, height: size }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={staff.image_path}
          alt={staff.display_name || staff.name}
          className="h-full w-full object-cover"
          style={{
            transform: `translate(${(staff.image_pos_x ?? 50) - 50}%, ${(staff.image_pos_y ?? 50) - 50}%) scale(${staff.image_scale ?? 1})`,
          }}
        />
      </div>
    );
  }
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-full font-bold text-white"
      style={{ width: size, height: size, backgroundColor: staff.color || "#334155" }}
    >
      {(staff.display_name || staff.name).slice(0, 1)}
    </div>
  );
}

// メニューカードのサムネイル（画像 or 仮アイコン）
function MenuThumb({ service }: { service: ServiceWithSteps }) {
  return (
    <div className="aspect-square w-[30%] max-w-[130px] shrink-0 self-start overflow-hidden rounded-xl bg-slate-100">
      {service.image_path ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={service.image_path} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-3xl">
          {menuIcon(service)}
        </div>
      )}
    </div>
  );
}

// メニューカードのバッジ
function MenuBadge({ service, stopped }: { service: ServiceWithSteps; stopped: boolean }) {
  const base = "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold";
  if (stopped)
    return <span className={`${base} bg-slate-400 text-white`}>新規受付停止中</span>;
  if (service.recommended)
    return <span className={`${base} bg-blue-600 text-white`}>イチオシ</span>;
  if (service.badge)
    return (
      <span className={base} style={{ backgroundColor: "#f4edda", color: "#a9822f" }}>
        {service.badge}
      </span>
    );
  return null;
}

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
  const [fromServiceId, setFromServiceId] = useState<string | null>(null); // 時間外導線の戻り先
  const [showAfterHours, setShowAfterHours] = useState(false); // 時間外枠のインライン表示
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
  // 時間外予約メニュー（この院に受付中のものがあれば）
  const afterHoursService = useMemo(
    () => clinicServices.find((s) => s.after_hours && s.new_booking) || null,
    [clinicServices]
  );
  // メニューカードの料金表示（スタッフ差があれば最小額＋「〜」）
  function menuPriceLabel(serviceId: string): string | null {
    const ps = prices.filter((p) => p.service_id === serviceId);
    const fmt = (n: number) => `¥${n.toLocaleString()}`;
    const part = (arr: number[], label: string) => {
      if (!arr.length) return null;
      const mn = Math.min(...arr);
      const mx = Math.max(...arr);
      return `${label} ${fmt(mn)}${mn !== mx ? "〜" : ""}`;
    };
    const inis = ps
      .map((p) => p.initial_price)
      .filter((n): n is number => n != null);
    const reps = ps
      .map((p) => p.repeat_price)
      .filter((n): n is number => n != null);
    const parts = [part(inis, "初診"), part(reps, "再診")].filter(Boolean);
    return parts.length ? parts.join(" ・ ") : null;
  }

  // 時間外の固定開始時刻（インライン表示用）
  const ahStarts = useMemo(() => {
    if (!afterHoursService?.class_starts) return undefined;
    const arr = afterHoursService.class_starts
      .split(",")
      .map((x) => parseInt(x.trim(), 10))
      .filter((n) => !isNaN(n));
    return arr.length ? arr : undefined;
  }, [afterHoursService]);

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

  function pickService(id: string, from: string | null = null) {
    // 新規受付停止メニュー（体幹教室など）も、既存会員の予約用にタップ可。
    // 「新規停止」は表示で案内する。
    // from: 時間外導線など「元のメニュー」を記録し、戻るで戻れるようにする。
    setFromServiceId(from);
    setServiceId(id);
    setSelected(null);
    // 対応できるスタッフの先頭を初期選択（クラスは担当者を使わない）
    const ids = new Set(links.filter((l) => l.service_id === id).map((l) => l.staff_id));
    const first = allStaff.find(
      (s) => ids.has(s.id) && s.patient_visible && s.bookable && s.status === "active"
    );
    setStaffId(first?.id || "");
    setShowAfterHours(false);
    setStep(2);
  }

  function onSelectSlot(date: string, startMin: number) {
    setSelected({ date, startMin });
  }

  // 確認モーダルを閉じる。時間外をインラインから選んでいた場合は元のメニューへ戻す。
  function closeConfirm() {
    setSelected(null);
    if (fromServiceId) {
      setServiceId(fromServiceId);
      setFromServiceId(null);
    }
  }

  // インラインの時間外枠を選択（元メニューを記録して時間外へ切替＋確認モーダル）
  function selectAfterHours(date: string, startMin: number) {
    if (!afterHoursService) return;
    setFromServiceId(service?.id ?? null);
    setServiceId(afterHoursService.id);
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
      <div className="mx-auto min-h-screen max-w-md bg-slate-50 pb-16 shadow-sm">
        <div
          className="px-6 pb-12 pt-12 text-center"
          style={{ background: `linear-gradient(180deg, ${NAVY} 0%, #172c56 100%)` }}
        >
          <div className="flex justify-center">
            <TraBadge size={184} />
          </div>
          <p className="mt-5 text-xs font-medium tracking-widest text-white/70">WEB予約</p>
        </div>
        <div className="px-5 py-7">
          <h2 className="mb-4 text-center text-sm font-bold text-slate-700">
            ご予約の院をお選びください
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
                <span
                  className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-2xl"
                  style={{ backgroundColor: "#f4edda", border: `1.5px solid ${GOLD}` }}
                >
                  {c.icon}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-bold text-slate-800">{c.name}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">{c.sub}</span>
                </span>
                <span style={{ color: GOLD }}>›</span>
              </button>
            ))}
          </div>
          <p className="mt-6 text-center text-[11px] text-slate-400">
            Total Recoverytation Abe ／ 阿部接骨院
          </p>
        </div>
      </div>
    );
  }

  const clinicName = CLINICS.find((c) => c.id === clinic)?.name ?? "";

  return (
    <div className="mx-auto min-h-screen max-w-md bg-white pb-24 shadow-sm">
      {/* ヘッダ */}
      <header className="sticky top-0 z-20 bg-white/95 backdrop-blur">
        <div
          className="flex items-center justify-center gap-2 px-4 py-2"
          style={{ background: NAVY }}
        >
          <span
            className="rounded-md px-1.5 py-0.5 text-[11px] font-black tracking-wider"
            style={{ background: GOLD, color: NAVY }}
          >
            TRA
          </span>
          <h1 className="text-sm font-bold text-white">Total Recoverytation Abe</h1>
        </div>
        <div className="border-b px-4 pt-2">
          <p className="text-center text-[11px]" style={{ color: GOLD }}>
            {clinicName} ／ WEB予約
          </p>
          <StepBar step={step} />
        </div>
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
            <div className="scroll-x mb-4 flex gap-1.5 overflow-x-auto pb-1">
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
          <div className="space-y-3">
            {shownServices.map((s) => {
              const stopped = !s.new_booking;
              const label = s.patient_name || s.name;
              const desc = s.short_desc || s.description;
              return (
                <button
                  key={s.id}
                  onClick={() => pickService(s.id)}
                  className={`flex w-full items-stretch gap-3 rounded-2xl border p-3 text-left transition ${
                    s.recommended
                      ? "border-blue-500 bg-blue-50/40 ring-1 ring-blue-200 active:bg-blue-50"
                      : "border-slate-200 bg-white active:bg-slate-50"
                  }`}
                >
                  <MenuThumb service={s} />
                  <div className="flex min-w-0 flex-1 flex-col">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-bold text-slate-800">{label}</span>
                      <MenuBadge service={s} stopped={stopped} />
                    </div>
                    {desc && (
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-slate-500">
                        {desc}
                      </p>
                    )}
                    <div className="mt-auto pt-1.5">
                      {menuPriceLabel(s.id) && (
                        <div className="text-[11px] font-bold" style={{ color: GOLD }}>
                          {menuPriceLabel(s.id)}
                        </div>
                      )}
                      <div className="text-[11px] text-slate-400">
                        所要 約{totalDuration(s.steps)}分
                        {s.capacity > 1 && `・定員${s.capacity}名`}
                      </div>
                    </div>
                  </div>
                  <span className="flex shrink-0 items-center text-lg text-slate-300">›</span>
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
          onBack={() => {
            // 時間外導線から来た場合は、元のメニューの日時選択に戻す
            if (fromServiceId) {
              const back = fromServiceId;
              pickService(back);
            } else {
              setStep(1);
            }
          }}
        >
          <div className="mb-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {service.patient_name || service.name}（所要 約{totalDuration(service.steps)}分）
            {isClass && `・定員${service.capacity}名`}
          </div>

          {/* 新規受付停止メニュー（体幹教室など）：既存の方のみ案内 */}
          {!service.new_booking && (
            <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              こちらは<b>新規受付を停止中</b>のメニューです。<b>すでに通われている方のみ</b>ご予約いただけます。はじめての方は受付できませんのでご了承ください。
            </div>
          )}

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

          {/* スタッフ紹介（担当者を選ぶと名前の下に顔写真＋紹介文） */}
          {!isClass && selectedStaff && (
            <div className="mb-3 flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <StaffAvatar staff={selectedStaff} />
              <div className="min-w-0">
                <div className="leading-snug text-slate-800">
                  <span className="font-bold">
                    {selectedStaff.display_name || selectedStaff.name}
                  </span>
                  {selectedStaff.role && (
                    <span className="ml-2 text-[11px]" style={{ color: GOLD }}>
                      {selectedStaff.role}
                    </span>
                  )}
                </div>
                {selectedStaff.bio ? (
                  <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-slate-600">
                    {selectedStaff.bio}
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-slate-400">
                    {selectedStaff.clinic || ""}
                  </p>
                )}
              </div>
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

          {/* 時間外への導線（時間外メニュー・体幹教室では出さない）。その場で下に展開。 */}
          {!afterHours && !isClass && afterHoursService && (
            <div className="mt-3">
              <button
                onClick={() => setShowAfterHours((v) => !v)}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-slate-50 py-3 text-sm font-bold text-slate-700 active:bg-slate-100"
              >
                🌙 20:30以降の「時間外予約」はこちら
                <span style={{ color: GOLD }}>{showAfterHours ? "▲" : "▼"}</span>
              </button>
              {showAfterHours && (
                <div className="mt-3 rounded-xl border border-slate-200 p-2">
                  <div className="mb-1 px-1 text-xs font-bold text-slate-600">
                    時間外予約（20:30以降）
                  </div>
                  <WeekCalendar
                    serviceId={afterHoursService.id}
                    serviceSteps={afterHoursService.steps}
                    capacity={afterHoursService.capacity}
                    classStarts={ahStarts}
                    afterHours={true}
                    afterHoursStarts={ahStarts}
                    staffId={staffId}
                    weekStart={weekStart}
                    schedules={schedules}
                    closures={closures}
                    apptSteps={apptSteps}
                    equipment={equipment}
                    slotUnit={settings?.slot_unit ?? 30}
                    sameDayOk={settings?.same_day_ok ?? true}
                    lastAcceptMin={null}
                    windows={windows}
                    selected={selected}
                    onSelect={selectAfterHours}
                  />
                </div>
              )}
            </div>
          )}

          {/* 日時を選ぶと中央にモーダルで確認 */}
          {selected && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
              onClick={closeConfirm}
            >
              <div
                className="w-full max-w-xs rounded-2xl bg-white p-5 shadow-2xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-800">予約日時を確認</h3>
                  <button
                    onClick={closeConfirm}
                    aria-label="閉じる"
                    className="-mr-1 -mt-1 text-2xl leading-none text-slate-400 active:text-slate-600"
                  >
                    ×
                  </button>
                </div>

                <div className="space-y-3">
                  {!isClass && selectedStaff && (
                    <div>
                      <div className="text-[11px] text-slate-400">担当</div>
                      <div className="font-bold text-slate-800">
                        {selectedStaff.display_name || selectedStaff.name}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="text-[11px] text-slate-400">日時</div>
                    <div className="font-bold text-slate-800">{fullDate(selected)}</div>
                    <div className="font-bold text-slate-800">
                      {minToLabel(selected.startMin)}〜
                    </div>
                  </div>
                  <div>
                    <div className="text-[11px] text-slate-400">メニュー</div>
                    <div className="font-bold text-slate-800">
                      {service.patient_name || service.name}
                    </div>
                  </div>
                </div>

                <div className="mt-5 space-y-2">
                  <button
                    onClick={() => setStep(3)}
                    className="w-full rounded-xl py-3.5 text-base font-bold text-white active:opacity-90"
                    style={{ backgroundColor: "#2563eb" }}
                  >
                    この日時で予約する
                  </button>
                  <button
                    onClick={closeConfirm}
                    className="w-full rounded-xl border border-slate-300 bg-white py-3 font-bold text-slate-600 active:bg-slate-50"
                  >
                    戻る
                  </button>
                </div>
              </div>
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

// モーダル用のフル日付（2026年7月17日（金））
function fullDate(sel: { date: string; startMin: number }): string {
  const d = fromDateStr(sel.date);
  return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日（${WEEKDAY_LABELS[d.getDay()]}）`;
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
