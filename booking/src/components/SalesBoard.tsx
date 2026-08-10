"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { loadAllStaff, loadServices } from "@/lib/data";
import { addDays, minToLabel, toDateStr, WEEKDAY_LABELS } from "@/lib/booking";
import type { Staff } from "@/lib/types";
import { DEFAULT_OPTIONS, defaultPrices, ageAt, JIKANGAI_MIN, menuIs60, menuHasTsuden, type SelfPrices, type SelfOptions } from "@/lib/pricing";

const KAWANISHI_COLOR = "#3F51B5"; // 川西整体院のカラー（ボード/カレンダーに合わせる）
const TAIKAN_COLOR = "#EF6C00"; // 体幹教室のカラー（カレンダーに合わせるオレンジ）

interface Appt {
  id: string;
  date: string;
  start_min: number;
  staff_id: string | null;
  service_id: string | null;
  service_name: string | null;
  patient_id: string | null;
  patient_name: string | null;
}
interface Sale {
  id: string;
  appointment_id: string | null;
  date: string;
  staff_id: string | null;
  patient_name: string | null;
  selfpay: number; // 保険外（自費）＝物販では販売価格
  insurance: number; // 合計額（保険総額）
  burden: number; // 負担額（窓口負担）
  cost: number; // 仕入れ（原価）。物販のみ。スタッフ売上は selfpay−cost（粗利）で計上
  anchor_appointment_id?: string | null; // 物販をこの予約(購入者)の下に置く
  sort_order?: number | null; // 手動並び替え用
  payment: "cash" | "cashless"; // 窓口徴収の支払方法
  retail?: boolean; // 物販（物販ページにも表示）
  retail_kind?: "sale" | "purchase"; // 物販の行種別。purchase(まとめ仕入)は日計表に出さない
  retail_buyer?: string | null; // 物販の購入者名（商品名は patient_name）
}
const zeroSale = (): Omit<Sale, "id" | "appointment_id" | "date" | "staff_id" | "patient_name"> => ({
  selfpay: 0,
  insurance: 0,
  burden: 0,
  cost: 0,
  payment: "cash",
  retail: false,
});

// レセコン取込の確認行（写真の1行＝patient1件ぶん）
type OcrReviewRow = { name: string; insurance: number; burden: number; selfpay: number; note?: string | null; apptId: string };
type OcrTotals = { count: number | null; insurance: number | null; burden: number | null; selfpay: number | null };
// 手書きメモから拾った物販（患者の保険外から分離して物販行にする）
type OcrRetailRow = { name: string; item: string; amount: number; on: boolean };

// アップロード前にブラウザ側で縮小（Vercelの本文上限とAPIコストを抑える）
function downscaleImage(file: File, maxDim: number, quality: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
      const w = Math.max(1, Math.round(img.width * scale));
      const h = Math.max(1, Math.round(img.height * scale));
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("nocanvas"));
      ctx.drawImage(img, 0, 0, w, h);
      resolve(canvas.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("imgload")); };
    img.src = url;
  });
}
const normName = (s: string | null | undefined) => (s || "").replace(/[\s　]/g, "").trim();

export default function SalesBoard() {
  const supabase = useMemo(() => createClient(), []);
  const [view, setView] = useState<"day" | "month" | "year">("day");
  const [date, setDate] = useState(() => toDateStr(new Date()));
  const [staff, setStaff] = useState<Staff[]>([]);
  const [kawa, setKawa] = useState<{ id: string; name: string; color: string } | null>(null);
  const [taikan, setTaikan] = useState<{ id: string; name: string; color: string } | null>(null);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const salesRef = useRef(sales);
  salesRef.current = sales;
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [clinicTarget, setClinicTarget] = useState(4_000_000); // 総売上目標の既定：400万
  const [loading, setLoading] = useState(true);
  // 自費の自動計算
  const [prices, setPrices] = useState<Record<string, SelfPrices>>({});
  const [options, setOptions] = useState<SelfOptions>(DEFAULT_OPTIONS);
  const [birth, setBirth] = useState<Record<string, string>>({}); // patient_id -> birth_date
  const [gaku, setGaku] = useState<Record<string, boolean>>({}); // appt_id -> 学生(上書き)
  const [lastVisit, setLastVisit] = useState<Record<string, string>>({}); // 患者キー -> 前回来院日
  const [lastVisitReady, setLastVisitReady] = useState(false);
  const [priceOpen, setPriceOpen] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragDy, setDragDy] = useState(0);
  const dragStartY = useRef(0);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  const rowRefs = useRef<Record<string, HTMLTableRowElement | null>>({});
  // レセコン取込
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [ocrOpen, setOcrOpen] = useState(false);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrRows, setOcrRows] = useState<OcrReviewRow[]>([]);
  const [ocrTotals, setOcrTotals] = useState<OcrTotals | null>(null);
  const [ocrNotes, setOcrNotes] = useState<string[]>([]);
  const [ocrRetail, setOcrRetail] = useState<OcrRetailRow[]>([]);
  const [ocrSaving, setOcrSaving] = useState(false);

  const monthStart = useMemo(() => date.slice(0, 8) + "01", [date]);
  const monthEnd = useMemo(() => {
    const [y, m] = date.split("-").map(Number);
    return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
  }, [date]);

  useEffect(() => {
    (async () => {
      const [st, sv] = await Promise.all([loadAllStaff(supabase), loadServices(supabase)]);
      const vis = st.filter((s) => s.admin_visible && s.status !== "retired");
      setStaff(vis);
      const t: Record<string, number> = {};
      vis.forEach((s) => (t[s.id] = (s as unknown as { sales_target?: number }).sales_target ?? 0));
      setTargets(t);
      const kw = sv.find((s) => s.category === "川西整体院");
      if (kw) setKawa({ id: kw.id, name: kw.name, color: KAWANISHI_COLOR });
      const tk = sv.find((s) => s.category === "体幹教室" || (s.capacity ?? 0) > 1);
      if (tk) setTaikan({ id: tk.id, name: "体幹教室", color: TAIKAN_COLOR });
      const { data: cfg } = await supabase.from("settings").select("clinic_sales_target, self_options").eq("id", 1).maybeSingle();
      if (cfg) {
        setClinicTarget((cfg as { clinic_sales_target?: number }).clinic_sales_target || 4_000_000);
        const so = (cfg as { self_options?: Partial<SelfOptions> }).self_options;
        if (so) setOptions({ ...DEFAULT_OPTIONS, ...so });
      }
      // スタッフ毎の料金（未設定は名前から既定値）
      const pm: Record<string, SelfPrices> = {};
      vis.forEach((s) => {
        const sp = (s as unknown as { self_prices?: Partial<SelfPrices> }).self_prices;
        pm[s.id] = { ...defaultPrices(s.name), ...(sp || {}) };
      });
      setPrices(pm);
    })();
  }, [supabase]);

  const reload = useCallback(async () => {
    setLoading(true);
    const [{ data: ap }, { data: sl }] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, date, start_min, staff_id, service_id, service_name, patient_id, patient_name")
        .neq("status", "cancelled")
        .gte("date", monthStart)
        .lt("date", monthEnd)
        .order("date")
        .order("start_min"),
      supabase
        .from("sales")
        .select("id, appointment_id, date, staff_id, patient_name, selfpay, insurance, burden, cost, retail, retail_kind, retail_buyer, anchor_appointment_id, sort_order, payment")
        .gte("date", monthStart)
        .lt("date", monthEnd),
    ]);
    setAppts((ap as Appt[]) ?? []);
    setSales((sl as Sale[]) ?? []);
    // 患者の生年月日（学生/一般の判定用）
    const pids = Array.from(new Set(((ap as Appt[]) ?? []).map((a) => a.patient_id).filter((x): x is string => !!x)));
    if (pids.length) {
      const { data: pts } = await supabase.from("patients").select("id, birth_date").in("id", pids);
      const bm: Record<string, string> = {};
      (pts as { id: string; birth_date: string | null }[] | null)?.forEach((p) => { if (p.birth_date) bm[p.id] = p.birth_date; });
      setBirth(bm);
    } else {
      setBirth({});
    }
    setLoading(false);
  }, [supabase, monthStart, monthEnd]);

  useEffect(() => {
    reload();
  }, [reload]);

  // 年間ビュー用：その年の売上を丸ごと取得（月別集計に使う）
  const [yearSales, setYearSales] = useState<Sale[]>([]);
  const [yearLoading, setYearLoading] = useState(false);
  const year = useMemo(() => date.slice(0, 4), [date]);
  useEffect(() => {
    if (view !== "year") return;
    let alive = true;
    (async () => {
      setYearLoading(true);
      const { data } = await supabase
        .from("sales")
        .select("id, appointment_id, date, staff_id, patient_name, selfpay, insurance, burden, cost, anchor_appointment_id, sort_order, payment")
        .gte("date", `${year}-01-01`)
        .lte("date", `${year}-12-31`);
      if (!alive) return;
      setYearSales((data as Sale[]) ?? []);
      setYearLoading(false);
    })();
    return () => { alive = false; };
  }, [view, year, supabase]);

  const saleByAppt = useMemo(() => {
    const m: Record<string, Sale> = {};
    sales.forEach((s) => {
      if (s.appointment_id) m[s.appointment_id] = s;
    });
    return m;
  }, [sales]);
  const manualSales = useMemo(() => sales.filter((s) => !s.appointment_id && s.retail_kind !== "purchase"), [sales]);
  // 予約（カレンダー）に存在する「日付＋氏名」の集合。予約に紐づかない“はぐれ売上”で
  // 同名のものは重複表示・二重計上しないための判定に使う。
  const apptKeys = useMemo(() => {
    const set = new Set<string>();
    appts.forEach((a) => { const nn = normName(a.patient_name); if (nn) set.add(a.date + "|" + nn); });
    return set;
  }, [appts]);
  const isOrphanDup = useCallback(
    (s: Sale) => !s.appointment_id && !!normName(s.patient_name) && apptKeys.has(s.date + "|" + normName(s.patient_name)),
    [apptKeys]
  );

  // 担当の選択肢（実スタッフ＋川西整体院）。realはスタッフ表に目標を持てる人。
  const assignees = useMemo(() => {
    const base = staff.map((s) => ({ id: s.id, name: s.name, color: s.color || "#64748b", real: true }));
    const extra: { id: string; name: string; color: string; real: boolean }[] = [];
    if (kawa) extra.push({ id: kawa.id, name: kawa.name, color: kawa.color, real: false });
    if (taikan) extra.push({ id: taikan.id, name: taikan.name, color: taikan.color, real: false });
    return [...base, ...extra];
  }, [staff, kawa, taikan]);
  // 体幹教室（定員制クラス）の予約か
  const isClassAppt = useCallback(
    (a: Appt) => !!taikan && a.service_id === taikan.id,
    [taikan]
  );
  // 川西→川西整体院、体幹教室→体幹教室に担当を自動割当
  const defStaffId = useCallback(
    (a: Appt) => {
      if (kawa && a.service_id === kawa.id) return kawa.id;
      if (taikan && a.service_id === taikan.id) return taikan.id;
      return a.staff_id;
    },
    [kawa, taikan]
  );

  // --- 予約行の編集（担当・自費・合計額・負担額） ---
  function apptVal(a: Appt): Sale {
    return (
      saleByAppt[a.id] ?? {
        id: "tmp-" + a.id,
        appointment_id: a.id,
        date: a.date,
        staff_id: defStaffId(a),
        patient_name: a.patient_name,
        ...zeroSale(),
      }
    );
  }
  function setApptField(a: Appt, field: "selfpay" | "insurance" | "burden" | "staff_id", val: number | string | null) {
    setSales((prev) => {
      const idx = prev.findIndex((s) => s.appointment_id === a.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], [field]: val };
        return next;
      }
      return [
        ...prev,
        {
          id: "tmp-" + a.id,
          appointment_id: a.id,
          date: a.date,
          staff_id: defStaffId(a),
          patient_name: a.patient_name,
          ...zeroSale(),
          [field]: val,
        } as Sale,
      ];
    });
  }
  async function persistAppt(a: Appt) {
    const s = salesRef.current.find((x) => x.appointment_id === a.id) ?? apptVal(a);
    await supabase.from("sales").upsert(
      {
        appointment_id: a.id,
        date: a.date,
        staff_id: s.staff_id ?? defStaffId(a),
        patient_name: a.patient_name,
        selfpay: s.selfpay,
        insurance: s.insurance,
        burden: s.burden,
      },
      { onConflict: "appointment_id" }
    );
    // reload() はしない：楽観更新済みの状態を保持し、連続入力中に
    // フォーカス（カーソル）が飛ばないようにする。金額はDBに保存済み。
  }

  // --- 手動行（物販・予約外） ---
  async function addManual(anchor?: string) {
    const { data } = await supabase
      .from("sales")
      .insert({ date, staff_id: null, patient_name: "", selfpay: 0, insurance: 0, burden: 0, cost: 0, retail: true, payment: "cash", anchor_appointment_id: anchor ?? null })
      .select("id, appointment_id, date, staff_id, patient_name, selfpay, insurance, burden, cost, retail, retail_buyer, anchor_appointment_id, payment")
      .single();
    if (data) setSales((prev) => [...prev, data as Sale]);
  }
  function setManualLocal(id: string, patch: Partial<Sale>) {
    setSales((prev) => prev.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  }
  async function persistManual(id: string) {
    const s = salesRef.current.find((x) => x.id === id);
    if (!s) return;
    await supabase
      .from("sales")
      .update({ staff_id: s.staff_id, patient_name: s.patient_name, retail_buyer: s.retail_buyer ?? null, selfpay: s.selfpay, insurance: s.insurance, burden: s.burden, cost: s.cost ?? 0, retail: s.retail ?? false })
      .eq("id", id);
  }
  async function deleteManual(id: string) {
    setSales((prev) => prev.filter((s) => s.id !== id));
    await supabase.from("sales").delete().eq("id", id);
  }
  // 予約(患者)行に入力した売上を削除（予約自体は消さない。金額・担当がリセットされる）
  async function deleteApptSale(a: Appt) {
    if (!confirm(`${a.patient_name || "この患者"} の売上入力を削除しますか？`)) return;
    setSales((prev) => prev.filter((s) => s.appointment_id !== a.id));
    await supabase.from("sales").delete().eq("appointment_id", a.id);
  }
  // 売上未入力の予約行から、その予約ごと削除（カレンダー/ボードからも消える）
  async function removeAppt(a: Appt) {
    if (!confirm(`${a.patient_name || "この予約"} の予約を削除します。\nカレンダー・ボードからも消えます。よろしいですか？`)) return;
    setAppts((prev) => prev.filter((x) => x.id !== a.id));
    await supabase.from("sales").delete().eq("appointment_id", a.id);
    await supabase.from("appointment_steps").delete().eq("appointment_id", a.id);
    await supabase.from("appointments").update({ status: "cancelled" }).eq("id", a.id);
  }
  // 支払方法（現金⇄キャッシュレス）切替。予約行は無ければ会計を作成して保存。
  async function toggleApptPayment(a: Appt) {
    const cur = salesRef.current.find((x) => x.appointment_id === a.id) ?? apptVal(a);
    const next: "cash" | "cashless" = cur.payment === "cashless" ? "cash" : "cashless";
    setSales((prev) => {
      const idx = prev.findIndex((s) => s.appointment_id === a.id);
      if (idx >= 0) { const n = [...prev]; n[idx] = { ...n[idx], payment: next }; return n; }
      return [...prev, { ...apptVal(a), id: "tmp-" + a.id, payment: next }];
    });
    await supabase.from("sales").upsert(
      {
        appointment_id: a.id, date: a.date, staff_id: cur.staff_id ?? defStaffId(a), patient_name: a.patient_name,
        selfpay: cur.selfpay, insurance: cur.insurance, burden: cur.burden, payment: next,
      },
      { onConflict: "appointment_id" }
    );
  }
  async function toggleManualPayment(m: Sale) {
    const next: "cash" | "cashless" = m.payment === "cashless" ? "cash" : "cashless";
    setManualLocal(m.id, { payment: next });
    await supabase.from("sales").update({ payment: next }).eq("id", m.id);
  }
  async function saveTarget(staffId: string, man: number) {
    const yenv = Math.max(0, Math.round(man * 10000));
    setTargets((t) => ({ ...t, [staffId]: yenv }));
    await supabase.from("staff").update({ sales_target: yenv }).eq("id", staffId);
  }
  async function saveClinicTarget(man: number) {
    const yenv = Math.max(0, Math.round(man * 10000));
    setClinicTarget(yenv);
    await supabase.from("settings").update({ clinic_sales_target: yenv }).eq("id", 1);
  }

  // --- 自費の自動計算（担当×メニュー×初診/再診×学生/一般） ---
  const is60 = (a: Appt) => menuIs60(a.service_name);
  const hasTsuden = (a: Appt) => menuHasTsuden(a.service_name);
  // 患者キー（患者ID優先、無ければ氏名）／月差
  const pkey = (a: { patient_id: string | null; patient_name: string | null }) => a.patient_id || "n:" + normName(a.patient_name);
  const monthGap = (from: string, to: string) => {
    const [fy, fm] = from.slice(0, 7).split("-").map(Number);
    const [ty, tm] = to.slice(0, 7).split("-").map(Number);
    return ty * 12 + tm - (fy * 12 + fm);
  };
  // 初診の自動判定：最終来院月＋2ヶ月の末日まで再診、それ以降は初診（＝月差3以上）。
  const autoFirst = (a: Appt): boolean => {
    if (!lastVisitReady) return false; // 判定前は安全側で再診
    const last = lastVisit[pkey(a)];
    if (!last) return true; // 初来院＝初診
    return monthGap(last, a.date) >= 3;
  };
  const isFirst = (a: Appt) => autoFirst(a);
  const isStudentAppt = (a: Appt) => {
    if (a.id in gaku) return gaku[a.id];
    const age = a.patient_id ? ageAt(birth[a.patient_id], a.date) : null;
    return age != null && age <= options.student_max_age;
  };
  const suggestSelf = (a: Appt): number => {
    if (kawa && a.service_id === kawa.id) return 0; // 川西は別料金
    if (isClassAppt(a)) return options.taikan_price; // 体幹教室は1回料金
    const staffId = a.staff_id;
    if (!staffId || !prices[staffId]) return 0;
    const p = prices[staffId];
    const first = isFirst(a);
    const base = is60(a) ? (first ? p.p60f : p.p60r) : (first ? p.p30f : p.p30r);
    const student = isStudentAppt(a);
    const tsu = hasTsuden(a) ? (student ? options.tsuden_gakusei : options.tsuden_ippan) : 0;
    const late = a.start_min >= JIKANGAI_MIN ? (student ? options.jikangai_gakusei : options.jikangai_ippan) : 0;
    return base + tsu + late;
  };
  // 当日の予約に、まだ自費が入っていない行だけ自動入力（既入力は上書きしない）
  async function autofillSelf() {
    const rows = dayRows.filter((a) => {
      if (kawa && a.service_id === kawa.id) return false;
      const s = saleByAppt[a.id];
      return !(s && s.selfpay > 0);
    });
    const ups = rows
      .map((a) => {
        const s = saleByAppt[a.id];
        return {
          appointment_id: a.id, date: a.date, staff_id: a.staff_id ?? defStaffId(a), patient_name: a.patient_name,
          selfpay: suggestSelf(a), insurance: s?.insurance ?? 0, burden: s?.burden ?? 0, payment: s?.payment ?? "cash",
        };
      })
      .filter((u) => u.selfpay > 0);
    if (!ups.length) return;
    await supabase.from("sales").upsert(ups, { onConflict: "appointment_id" });
    reload();
  }
  // 料金設定の編集
  function setPrice(staffId: string, key: keyof SelfPrices, val: number) {
    setPrices((prev) => ({ ...prev, [staffId]: { ...prev[staffId], [key]: val } }));
  }
  function setOpt(key: keyof SelfOptions, val: number) {
    setOptions((prev) => ({ ...prev, [key]: val }));
  }
  async function persistPrices() {
    await Promise.all([
      ...Object.entries(prices).map(([id, p]) => supabase.from("staff").update({ self_prices: p }).eq("id", id)),
      supabase.from("settings").update({ self_options: options }).eq("id", 1),
    ]);
    setPriceOpen(false);
  }


  // --- レセコン写真の取込 ---
  function bestMatchAppt(name: string): string {
    const n = normName(name);
    if (!n) return "";
    let hit = dayRows.find((a) => normName(a.patient_name) === n);
    if (hit) return hit.id;
    hit = dayRows.find((a) => {
      const p = normName(a.patient_name);
      return !!p && (p.includes(n) || n.includes(p));
    });
    return hit ? hit.id : "";
  }
  async function onPickReseko(file: File) {
    setOcrError(null);
    setOcrRows([]);
    setOcrNotes([]);
    setOcrRetail([]);
    setOcrTotals(null);
    setOcrOpen(true);
    setOcrBusy(true);
    try {
      const dataUrl = await downscaleImage(file, 2200, 0.82);
      const res = await fetch("/api/sales/ocr", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ image: dataUrl }),
      });
      const j = (await res.json()) as {
        ok: boolean;
        reason?: string;
        result?: {
          rows: { name?: string; insurance?: number | null; burden?: number | null; selfpay?: number | null; note?: string | null }[];
          totals: OcrTotals;
          notes?: string[];
          retail?: { name?: string | null; item?: string | null; amount?: number | null }[];
        };
      };
      if (!j.ok || !j.result) {
        setOcrError(
          j.reason === "nokey"
            ? "サーバーにAPIキー（ANTHROPIC_API_KEY）が未設定です。設定後に使えます。"
            : j.reason === "parse"
            ? "うまく読み取れませんでした。明るく正面から撮り直して再度お試しください。"
            : j.reason === "noimage"
            ? "画像を認識できませんでした。"
            : "AIへの接続に失敗しました。時間をおいて再度お試しください。"
        );
        return;
      }
      const rows: OcrReviewRow[] = (j.result.rows || []).map((r) => ({
        name: r.name || "",
        insurance: Number(r.insurance) || 0,
        burden: Number(r.burden) || 0,
        selfpay: Number(r.selfpay) || 0,
        note: r.note ?? null,
        apptId: bestMatchAppt(r.name || ""),
      }));
      setOcrRows(rows);
      setOcrTotals(j.result.totals ?? null);
      setOcrNotes(j.result.notes ?? []);
      const retail: OcrRetailRow[] = (j.result.retail || [])
        .filter((x) => (Number(x.amount) || 0) > 0)
        .map((x) => ({ name: x.name || "", item: x.item || "物販", amount: Number(x.amount) || 0, on: true }));
      setOcrRetail(retail);
    } catch {
      setOcrError("画像の処理に失敗しました。");
    } finally {
      setOcrBusy(false);
    }
  }
  function setOcrRow(i: number, patch: Partial<OcrReviewRow>) {
    setOcrRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  function setOcrRetailRow(i: number, patch: Partial<OcrRetailRow>) {
    setOcrRetail((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  async function saveOcr() {
    setOcrSaving(true);
    const activeRetail = ocrRetail.filter((r) => r.on && r.amount > 0);
    // 物販は患者の保険外に含まれて印字されるので、氏名一致で保険外から差し引く（二重計上防止）
    const retailByName = new Map<string, number>();
    activeRetail.forEach((r) => {
      const k = normName(r.name);
      if (k) retailByName.set(k, (retailByName.get(k) ?? 0) + r.amount);
    });
    // 同じ予約にマッチした複数行（保険＋自費など）は合算
    const byAppt = new Map<string, { insurance: number; burden: number; selfpay: number }>();
    ocrRows.forEach((r) => {
      if (!r.apptId) return;
      let sp = r.selfpay || 0;
      const k = normName(r.name);
      const cut = retailByName.get(k) ?? 0;
      if (cut > 0) { const use = Math.min(cut, sp); sp -= use; retailByName.set(k, cut - use); }
      const cur = byAppt.get(r.apptId) ?? { insurance: 0, burden: 0, selfpay: 0 };
      cur.insurance += r.insurance || 0;
      cur.burden += r.burden || 0;
      cur.selfpay += sp;
      byAppt.set(r.apptId, cur);
    });
    const ups = Array.from(byAppt.entries()).map(([apptId, v]) => {
      const a = dayRows.find((x) => x.id === apptId);
      return {
        appointment_id: apptId,
        date: a?.date ?? date,
        staff_id: a ? defStaffId(a) : null,
        patient_name: a?.patient_name ?? null,
        selfpay: v.selfpay,
        insurance: v.insurance,
        burden: v.burden,
      };
    });
    if (ups.length) await supabase.from("sales").upsert(ups, { onConflict: "appointment_id" });
    // 物販行を挿入（担当なし＝物販バケット）
    if (activeRetail.length) {
      const inserts = activeRetail.map((r) => ({
        date, staff_id: null, patient_name: `${r.name} ${r.item}`.trim(), selfpay: r.amount, insurance: 0, burden: 0, payment: "cash" as const,
      }));
      await supabase.from("sales").insert(inserts);
    }
    setOcrSaving(false);
    setOcrOpen(false);
    setOcrRows([]);
    setOcrRetail([]);
    reload();
  }

  // --- 経理用：日毎の現金/キャッシュレス内訳をCSV書き出し ---
  function exportKeiriCsv() {
    const header = ["日付", "件数", "合計額", "負担額", "保険外", "窓口額計", "キャッシュレス", "現金売上", "総売上"];
    const lines = [header.join(",")];
    monthDaily.forEach(([dt, e]) => {
      const selfpay = e.ho1 + e.ho2 + e.ho3 + e.ho4 + e.kawa;
      const win = e.cash + e.cashless;
      const uriage = e.ins + selfpay;
      lines.push([dt.replace(/-/g, "/"), e.cnt, e.ins, e.bur, selfpay, win, e.cashless, e.cash, uriage].join(","));
    });
    const totSelf = monthSum.ho1 + monthSum.ho2 + monthSum.ho3 + monthSum.ho4 + monthSum.kawa;
    lines.push(["月計", monthSum.cnt, monthSum.ins, monthSum.bur, totSelf, monthSum.cash + monthSum.cashless, monthSum.cashless, monthSum.cash, monthSum.ins + totSelf].join(","));
    const csv = "﻿" + lines.join("\r\n"); // Excelで文字化けしないようBOM付き
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `現金キャッシュレス内訳_${monthStart.slice(0, 7)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  // --- 集計 ---
  const total = (s: { selfpay: number; insurance: number }) => s.selfpay + s.insurance; // 合計（販売価格ベース）
  const paid = (s: { selfpay: number; burden: number }) => s.selfpay + s.burden; // 入金額
  // 日計表は売上（販売そのまま）。粗利は物販ページで管理するのでここでは原価を引かない。
  const staffTotal = useCallback(
    (staffId: string | null) =>
      sales.reduce((sum, s) => (s.staff_id === staffId ? sum + total(s) : sum), 0),
    [sales]
  );
  // その日の担当別売上（自費＋保険）
  const dayStaffTotal = useCallback(
    (staffId: string | null) =>
      sales.reduce((sum, s) => (s.date === date && s.staff_id === staffId ? sum + total(s) : sum), 0),
    [sales, date]
  );
  // Enterで次の金額欄へ移動（保険外→合計額→負担額→次の行の保険外…）。表示中の欄だけ辿る。
  function onAmountKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key !== "Enter") return;
    e.preventDefault();
    const inputs = Array.from(
      document.querySelectorAll<HTMLInputElement>("input[data-amt='1']")
    ).filter((el) => el.offsetParent !== null);
    const i = inputs.indexOf(e.currentTarget);
    const next = inputs[i + 1];
    if (next) { next.focus(); next.select(); }
    else e.currentTarget.blur();
  }
  // 当月の出勤日数（売上のあった日数）
  const staffDays = useCallback(
    (staffId: string | null) => {
      const set = new Set<string>();
      sales.forEach((s) => { if (s.staff_id === staffId && total(s) > 0) set.add(s.date); });
      return set.size;
    },
    [sales]
  );
  // 担当ごとの自費（保険外）月計
  const spByStaff = useCallback(
    (staffId: string | null) =>
      sales.reduce((sum, s) => (s.staff_id === staffId ? sum + s.selfpay : sum), 0),
    [sales]
  );

  const yen = (n: number) => "¥" + n.toLocaleString();
  const d = new Date(date + "T00:00:00");
  const monthLabel = `${d.getFullYear()}年${d.getMonth() + 1}月`;
  // ‹ › の移動幅：日=1日 / 月=1ヶ月 / 年=1年
  const stepDate = (dir: number) => {
    if (view === "year") { const nd = new Date(d); nd.setFullYear(nd.getFullYear() + dir); setDate(toDateStr(nd)); }
    else setDate(toDateStr(addDays(d, dir * (view === "month" ? 31 : 1))));
  };

  // 当日の行（予約＋手動）
  const dayRows = useMemo(() => {
    const aps = appts.filter((a) => a.date === date);
    return aps;
  }, [appts, date]);

  // 当日の患者ごとの「前回来院日」（初診/再診の自動判定用）
  useEffect(() => {
    let alive = true;
    (async () => {
      setLastVisitReady(false);
      if (!dayRows.length) { setLastVisit({}); setLastVisitReady(true); return; }
      const pids = Array.from(new Set(dayRows.map((a) => a.patient_id).filter((x): x is string => !!x)));
      const names = Array.from(new Set(dayRows.filter((a) => !a.patient_id).map((a) => (a.patient_name || "").trim()).filter(Boolean)));
      const map: Record<string, string> = {};
      const consume = (rows: { patient_id: string | null; patient_name: string | null; date: string }[] | null) => {
        (rows || []).forEach((r) => {
          const k = r.patient_id || "n:" + normName(r.patient_name);
          if (!map[k] || r.date > map[k]) map[k] = r.date; // 最新の前回来院日
        });
      };
      if (pids.length) {
        const { data } = await supabase.from("appointments").select("patient_id, patient_name, date").in("patient_id", pids).lt("date", date).neq("status", "cancelled");
        consume(data as never);
      }
      if (names.length) {
        const { data } = await supabase.from("appointments").select("patient_id, patient_name, date").in("patient_name", names).lt("date", date).neq("status", "cancelled");
        consume(data as never);
      }
      if (alive) { setLastVisit(map); setLastVisitReady(true); }
    })();
    return () => { alive = false; };
  }, [dayRows, date, supabase]);
  // 予約に同名がいる“はぐれ売上”は日別入力に出さない（予約行に集約）。物販・予約外はそのまま。
  const dayManual = useMemo(() => manualSales.filter((s) => s.date === date && !isOrphanDup(s)), [manualSales, date, isOrphanDup]);
  // 並び順（sort_orderで手動入れ替え可。既定は予約=時刻順、物販=末尾）
  const dayItems = useMemo(() => {
    const items = [
      ...dayRows.map((a, i) => ({ kind: "appt" as const, a, ord: saleByAppt[a.id]?.sort_order ?? a.start_min * 1000 + i })),
      ...dayManual.map((m, i) => ({ kind: "manual" as const, m, ord: m.sort_order ?? 9_000_000 + i })),
    ];
    items.sort((x, y) => x.ord - y.ord);
    return items;
  }, [dayRows, dayManual, saleByAppt]);

  async function setItemOrder(it: { kind: "appt"; a: Appt } | { kind: "manual"; m: Sale }, ord: number) {
    if (it.kind === "manual") {
      setSales((prev) => prev.map((s) => (s.id === it.m.id ? { ...s, sort_order: ord } : s)));
      await supabase.from("sales").update({ sort_order: ord }).eq("id", it.m.id);
    } else {
      const a = it.a;
      const cur = salesRef.current.find((s) => s.appointment_id === a.id);
      await supabase.from("sales").upsert(
        {
          appointment_id: a.id, date: a.date, staff_id: cur?.staff_id ?? defStaffId(a), patient_name: a.patient_name,
          selfpay: cur?.selfpay ?? 0, insurance: cur?.insurance ?? 0, burden: cur?.burden ?? 0, sort_order: ord,
        },
        { onConflict: "appointment_id" }
      );
    }
  }
  const itemId = (it: { kind: "appt"; a: Appt } | { kind: "manual"; m: Sale }) => (it.kind === "appt" ? it.a.id : it.m.id);
  // 入力欄・ボタン・セレクトの上ではドラッグを開始しない（編集を優先）
  function isInteractiveTarget(t: EventTarget | null): boolean {
    let el = t as HTMLElement | null;
    while (el) {
      const tag = el.tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA" || tag === "BUTTON" || tag === "OPTION" || tag === "A" || tag === "LABEL" || el.isContentEditable) return true;
      el = el.parentElement;
    }
    return false;
  }
  // 行のどこでもドラッグで並び替え（入力欄以外）。スマホ(タッチ)では誤操作防止で無効。
  function onRowPointerDown(e: React.PointerEvent, id: string) {
    if (e.pointerType !== "mouse") return; // タッチは並び替えしない（スクロール・入力優先）
    if (e.button !== 0) return;
    if (isInteractiveTarget(e.target)) return;
    onDragStart(e, id);
  }
  // ドラッグ＆ドロップ並び替え（マウス・タッチ両対応）
  function onDragStart(e: React.PointerEvent, id: string) {
    setDragId(id);
    setDragDy(0);
    dragStartY.current = e.clientY;
    setDrop({ id, after: false });
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } catch {}
  }
  function onDragMove(e: React.PointerEvent) {
    if (!dragId) return;
    setDragDy(e.clientY - dragStartY.current);
    const y = e.clientY;
    let best: { id: string; after: boolean } | null = null;
    for (const it of dayItems) {
      const id = itemId(it);
      const el = rowRefs.current[id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (y < r.top) { best = { id, after: false }; break; }
      if (y <= r.bottom) { best = { id, after: y > r.top + r.height / 2 }; break; }
      best = { id, after: true };
    }
    if (best && (best.id !== drop?.id || best.after !== drop?.after)) setDrop(best);
  }
  async function onDragEnd() {
    const cur = dragId;
    const dr = drop;
    setDragId(null);
    setDragDy(0);
    setDrop(null);
    if (!cur) return;
    const ids = dayItems.map(itemId).filter((x) => x !== cur);
    if (dr && dr.id !== cur) {
      let idx = ids.indexOf(dr.id);
      if (idx < 0) idx = ids.length;
      else if (dr.after) idx += 1;
      ids.splice(idx, 0, cur);
    } else {
      ids.splice(dayItems.map(itemId).indexOf(cur), 0, cur);
    }
    const byId: Record<string, { kind: "appt"; a: Appt } | { kind: "manual"; m: Sale }> = {};
    dayItems.forEach((it) => { byId[itemId(it)] = it; });
    await Promise.all(ids.map((id, i) => (byId[id] ? setItemOrder(byId[id], i * 10) : Promise.resolve())));
    reload();
  }
  // 行に付けるドラッグ用ハンドラ（行のどこでも掴める）
  const dragHandlers = (id: string) => ({
    onPointerDown: (e: React.PointerEvent) => onRowPointerDown(e, id),
    onPointerMove: onDragMove,
    onPointerUp: onDragEnd,
    onPointerCancel: onDragEnd,
  });
  // 担当スタッフのカラー（#rrggbb）。担当セルの色分けに使う。
  const colorOf = (staffId: string | null): string | null => {
    const c = assignees.find((s) => s.id === staffId)?.color;
    return c && /^#[0-9a-f]{6}$/i.test(c) ? c : null;
  };
  // 担当セル（左端）の色付きバッジ風 select
  const assigneeSelectStyle = (staffId: string | null): React.CSSProperties => {
    const c = colorOf(staffId);
    return c
      ? { backgroundColor: c, color: "#fff", borderColor: c }
      : { backgroundColor: "#f1f5f9", color: "#64748b", borderColor: "#e2e8f0" };
  };
  // ドラッグ中の行は「浮き上がって」指に追従、落とし先には青いライン
  const rowStyle = (id: string): React.CSSProperties => {
    if (dragId === id)
      return {
        transform: `translateY(${dragDy}px)`,
        position: "relative",
        zIndex: 30,
        background: "#fff",
        boxShadow: "0 12px 28px rgba(0,0,0,.20), inset 0 0 0 2px #60a5fa",
      };
    return {};
  };
  const rowClass = (id: string, base = "") =>
    `${base} ${dragId ? "transition-none" : ""} ${
      dragId && dragId !== id && drop?.id === id
        ? drop.after
          ? "shadow-[inset_0_-3px_0_0_#3b82f6]"
          : "shadow-[inset_0_3px_0_0_#3b82f6]"
        : ""
    }`;

  // 当日の合計
  const daySum = useMemo(() => {
    let sp = 0, ins = 0, bur = 0, cnt = 0, cash = 0, cashless = 0;
    const addPay = (s: Sale) => {
      const p = s.selfpay + s.burden; // 窓口徴収
      if (s.payment === "cashless") cashless += p; else cash += p;
    };
    dayRows.forEach((a) => {
      const s = saleByAppt[a.id];
      if (s) { sp += s.selfpay; ins += s.insurance; bur += s.burden; addPay(s); }
      cnt++;
    });
    dayManual.forEach((s) => { sp += s.selfpay; ins += s.insurance; bur += s.burden; addPay(s); cnt++; });
    return { sp, ins, bur, cnt, cash, cashless, paid: sp + bur, gou: sp + ins };
  }, [dayRows, dayManual, saleByAppt]);

  // 保険外の担当バケット（1=阿部/2=澁谷/3=萩原・林/4=物販・その他）
  const bucket = useMemo(() => {
    const find = (...kw: string[]) => staff.find((s) => kw.some((k) => s.name.includes(k)))?.id ?? null;
    return { abe: find("阿部"), shibu: find("澁谷", "渋谷"), hagi: find("萩原"), haya: find("林") };
  }, [staff]);

  type DayAgg = { cnt: number; shin: number; ins: number; bur: number; ho1: number; ho2: number; ho3: number; ho4: number; kawa: number; cash: number; cashless: number };
  // 日計表（月）：レセコン（茨木本院）と同じ並び＋川西整体院は独立列＋現金/キャッシュレス
  const monthDaily = useMemo(() => {
    const map = new Map<string, DayAgg>();
    const get = (dt: string) => {
      let e = map.get(dt);
      if (!e) { e = { cnt: 0, shin: 0, ins: 0, bur: 0, ho1: 0, ho2: 0, ho3: 0, ho4: 0, kawa: 0, cash: 0, cashless: 0 }; map.set(dt, e); }
      return e;
    };
    // 件数・新患（予約ベース／新患は当月内で初めて出た氏名を目安に。川西は本院レセコンから除外）
    const seen = new Set<string>();
    [...appts]
      .filter((a) => !(kawa && a.service_id === kawa.id))
      .sort((a, b) => a.date.localeCompare(b.date) || a.start_min - b.start_min)
      .forEach((a) => {
        const e = get(a.date);
        e.cnt++;
        const nm = (a.patient_name || "").trim();
        if (nm && !seen.has(nm)) { seen.add(nm); e.shin++; }
      });
    // 金額（salesベース）：川西は独立集計、それ以外は合計額・負担額＋保険外1〜4に振り分け
    sales.forEach((s) => {
      if (isOrphanDup(s)) return; // 予約に同名がいる“はぐれ売上”は二重計上しない
      const e = get(s.date);
      // 窓口徴収(=保険外+負担額)の現金/キャッシュレス仕訳（全会計対象）
      const pay = s.selfpay + s.burden;
      if (s.payment === "cashless") e.cashless += pay; else e.cash += pay;
      if (kawa && s.staff_id === kawa.id) { e.kawa += s.selfpay + s.insurance; return; }
      e.ins += s.insurance;
      e.bur += s.burden;
      if (s.staff_id && s.staff_id === bucket.abe) e.ho1 += s.selfpay;
      else if (s.staff_id && s.staff_id === bucket.shibu) e.ho2 += s.selfpay;
      else if (s.staff_id && (s.staff_id === bucket.hagi || s.staff_id === bucket.haya || s.staff_id === taikan?.id)) e.ho3 += s.selfpay;
      else e.ho4 += s.selfpay; // 物販・その他のみ
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [appts, sales, bucket, kawa, taikan, isOrphanDup]);
  const monthSum = useMemo(
    () =>
      monthDaily.reduce(
        (acc, [, e]) => ({
          cnt: acc.cnt + e.cnt, shin: acc.shin + e.shin, ins: acc.ins + e.ins, bur: acc.bur + e.bur,
          ho1: acc.ho1 + e.ho1, ho2: acc.ho2 + e.ho2, ho3: acc.ho3 + e.ho3, ho4: acc.ho4 + e.ho4, kawa: acc.kawa + e.kawa,
          cash: acc.cash + e.cash, cashless: acc.cashless + e.cashless,
        }),
        { cnt: 0, shin: 0, ins: 0, bur: 0, ho1: 0, ho2: 0, ho3: 0, ho4: 0, kawa: 0, cash: 0, cashless: 0 }
      ),
    [monthDaily]
  );
  const monthSp = monthSum.ho1 + monthSum.ho2 + monthSum.ho3 + monthSum.ho4;

  // 年間集計：担当×月の 保険(insurance)/自費(selfpay)、川西院、物販・その他。
  const yearData = useMemo(() => {
    const rows = staff.map((s) => ({
      id: s.id,
      name: s.name,
      color: s.color || "#64748b",
      hoken: new Array(12).fill(0) as number[],
      jihi: new Array(12).fill(0) as number[],
    }));
    const byId = new Map(rows.map((r) => [r.id, r]));
    const kawaM = new Array(12).fill(0) as number[]; // 川西院（自費+保険）
    const taikanM = new Array(12).fill(0) as number[]; // 体幹教室（自費+保険）
    const busM = new Array(12).fill(0) as number[]; // 物販・その他（担当なし）
    yearSales.forEach((s) => {
      const m = Number(s.date.slice(5, 7)) - 1;
      if (m < 0 || m > 11) return;
      if (kawa && s.staff_id === kawa.id) { kawaM[m] += s.selfpay + s.insurance; return; }
      if (taikan && s.staff_id === taikan.id) { taikanM[m] += s.selfpay + s.insurance; return; }
      const r = s.staff_id ? byId.get(s.staff_id) : undefined;
      if (r) { r.hoken[m] += s.insurance; r.jihi[m] += s.selfpay; }
      else busM[m] += s.selfpay + s.insurance;
    });
    const perMonth = (fn: (m: number) => number) => new Array(12).fill(0).map((_, m) => fn(m));
    const hokenTotal = perMonth((m) => rows.reduce((x, r) => x + r.hoken[m], 0));
    const jihiTotal = perMonth((m) => rows.reduce((x, r) => x + r.jihi[m], 0));
    const sougou = perMonth((m) => hokenTotal[m] + jihiTotal[m] + kawaM[m] + taikanM[m]);
    const busKomi = perMonth((m) => sougou[m] + busM[m]);
    return { rows, kawaM, taikanM, busM, hokenTotal, jihiTotal, sougou, busKomi };
  }, [yearSales, staff, kawa, taikan]);
  const sum12 = (a: number[]) => a.reduce((x, y) => x + y, 0);

  const btn = "flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 active:bg-slate-100";
  const amt = "w-[60px] rounded border border-slate-300 px-1 py-0 text-right text-[13px] leading-tight tabnum focus:border-blue-400 focus:outline-none";
  const payBtn = (payment: "cash" | "cashless", onClick: () => void) => (
    <button onClick={onClick}
      className={`whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${payment === "cashless" ? "border-indigo-300 bg-indigo-50 text-indigo-600" : "border-slate-300 bg-slate-50 text-slate-500"}`}
      title="現金／キャッシュレス切替">
      {payment === "cashless" ? "💳レス" : "💴現金"}
    </button>
  );

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link href="/admin" className="flex shrink-0 items-center gap-1 rounded-md bg-slate-600 px-2 py-1 text-[11px] font-bold text-white active:bg-slate-700">
          ← 予約一覧
        </Link>
        <h1 className="text-lg font-bold text-slate-800">個別売上</h1>
        <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
          {([["day", "日別入力"], ["month", "日計表(月)"], ["year", "年間"]] as const).map(([v, l]) => (
            <button key={v} onClick={() => setView(v)}
              className={`rounded px-2 py-1 text-[11px] font-bold ${view === v ? "bg-blue-600 text-white" : "text-slate-600"}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => stepDate(-1)} className={btn}>‹</button>
          <button onClick={() => setDate(toDateStr(new Date()))} className="rounded-md bg-blue-600 px-2 py-1 text-[11px] font-bold text-white active:bg-blue-700">今日</button>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-md border border-slate-300 px-1 py-1 text-[12px] text-slate-600" />
          <button onClick={() => stepDate(1)} className={btn}>›</button>
        </div>
      </div>

      {/* 当月サマリー（担当ごとの総売上＝自費＋保険 vs 目標）。年間ビューでは非表示。 */}
      {view !== "year" && (
      <div className="mb-3 rounded-xl border bg-white p-2">
        {(() => {
          const clinicTotal = monthSp + monthSum.kawa + monthSum.ins;
          const pct = clinicTarget > 0 ? Math.round((clinicTotal / clinicTarget) * 1000) / 10 : 0;
          return (
            <>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5 text-[13px]">
                <span className="font-bold text-slate-700">{monthLabel} 当月</span>
                <span className="text-slate-500">保険 <b className="tabnum text-slate-700">{yen(monthSum.ins)}</b></span>
                <span className="text-slate-500">自費 <b className="tabnum text-slate-700">{yen(monthSp + monthSum.kawa)}</b></span>
                <span className="ml-auto flex items-center gap-1 text-[11px] text-slate-400">
                  院目標
                  <input type="number" min={0} value={clinicTarget ? clinicTarget / 10000 : ""} placeholder="0"
                    onChange={(e) => saveClinicTarget(parseFloat(e.target.value || "0"))}
                    className="w-14 rounded border border-slate-300 px-1 py-0 text-right text-[11px]" />万
                </span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                <span className="text-base font-bold tabnum text-slate-800">総売上 {yen(clinicTotal)}</span>
                {clinicTarget > 0 && (
                  <span className={`text-[13px] font-bold ${pct >= 100 ? "text-emerald-600" : pct >= 70 ? "text-blue-600" : "text-slate-500"}`}>{pct}%</span>
                )}
                {view === "day" && (
                  <span className="rounded-md bg-blue-50 px-1.5 py-0 text-[13px] font-bold text-blue-700">
                    {new Date(date + "T00:00:00").getMonth() + 1}/{new Date(date + "T00:00:00").getDate()} 合計 {yen(daySum.gou)}
                  </span>
                )}
              </div>
              {clinicTarget > 0 && (
                <div className="mb-2 mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              )}
            </>
          );
        })()}
        <div className="grid grid-cols-2 gap-1.5 md:grid-cols-4">
          {assignees.map((s) => {
            const tot = staffTotal(s.id);
            const target = targets[s.id] ?? 0;
            const pct = target > 0 ? Math.round((tot / target) * 1000) / 10 : 0;
            return (
              <div key={s.id} className="rounded-lg border px-2 py-1">
                <div className="flex items-center gap-1">
                  <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-[13px] font-bold text-slate-800">{s.name}</span>
                  <span className="text-[10px] font-bold text-slate-400">{staffDays(s.id)}日</span>
                  {s.real && (
                    <span className="ml-auto flex items-center gap-0.5 text-[10px] text-slate-400">
                      目標
                      <input type="number" min={0} value={target ? target / 10000 : ""} placeholder="0"
                        onChange={(e) => saveTarget(s.id, parseFloat(e.target.value || "0"))}
                        className="w-8 rounded border border-slate-300 px-1 py-0 text-right text-[10px]" />万
                    </span>
                  )}
                </div>
                <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
                  <span className="text-[15px] font-bold tabnum text-slate-800">{yen(tot)}</span>
                  <span className="text-[9px] text-slate-400">当月</span>
                  {target > 0 && <span className={`text-[11px] font-bold ${pct >= 100 ? "text-emerald-600" : pct >= 70 ? "text-blue-600" : "text-slate-500"}`}>{pct}%</span>}
                  {view === "day" && (
                    <span className="ml-auto flex items-baseline gap-0.5">
                      <span className="rounded px-1 text-[9px] font-bold text-white" style={{ backgroundColor: s.color }}>本日</span>
                      <span className="text-[13px] font-bold tabnum" style={{ color: s.color }}>{yen(dayStaffTotal(s.id))}</span>
                    </span>
                  )}
                </div>
                {target > 0 && (
                  <div className="mt-0.5 h-1 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: s.color }} />
                  </div>
                )}
              </div>
            );
          })}
          <div className="rounded-lg border px-2 py-1">
            <div className="flex items-center gap-1">
              <span className="inline-block h-2 w-2 rounded-full bg-amber-500" />
              <span className="text-[13px] font-bold text-slate-800">物販・その他</span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 gap-y-0">
              <span className="text-[15px] font-bold tabnum text-slate-800">{yen(staffTotal(null))}</span>
              <span className="text-[9px] text-slate-400">当月</span>
              {view === "day" && (
                <span className="ml-auto flex items-baseline gap-0.5">
                  <span className="rounded bg-amber-500 px-1 text-[9px] font-bold text-white">本日</span>
                  <span className="text-[13px] font-bold tabnum text-amber-600">{yen(dayStaffTotal(null))}</span>
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
      )}

      {view === "year" ? (
        /* ===== 年間一覧（担当×月：保険/自費/総計＋総合計） ===== */
        yearLoading ? (
          <p className="py-10 text-center text-sm text-slate-500">読み込み中…</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border bg-white p-2">
            <div className="mb-1 px-1 text-sm font-bold text-slate-700">{year}年 個別売上 年間</div>
            <table className="min-w-[760px] w-full border-collapse text-[11px]">
              <thead>
                <tr className="border-b bg-slate-50 text-slate-500">
                  <th className="px-1 py-1.5 text-left" colSpan={2}>担当</th>
                  {Array.from({ length: 12 }, (_, m) => (
                    <th key={m} className="px-1 py-1.5 text-right font-bold">{m + 1}月</th>
                  ))}
                  <th className="px-1.5 py-1.5 text-right font-bold text-slate-700">年間</th>
                </tr>
              </thead>
              <tbody>
                {yearData.rows.map((r) => {
                  const sokei = Array.from({ length: 12 }, (_, m) => r.hoken[m] + r.jihi[m]);
                  const cell = (v: number, bold = false) => (
                    <td className={`px-1 py-0.5 text-right tabnum ${v ? "text-slate-700" : "text-slate-300"} ${bold ? "font-bold" : ""}`}>{v.toLocaleString()}</td>
                  );
                  return (
                    <Fragment key={r.id}>
                      <tr className="border-t" style={{ backgroundColor: r.color + "10" }}>
                        <td rowSpan={3} className="px-1.5 align-middle text-[12px] font-bold text-slate-800" style={{ backgroundColor: r.color + "22" }}>
                          <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ backgroundColor: r.color }} />{r.name}
                        </td>
                        <td className="whitespace-nowrap px-1 py-0.5 text-slate-400">保険</td>
                        {r.hoken.map((v, m) => <Fragment key={m}>{cell(v)}</Fragment>)}
                        {cell(sum12(r.hoken), true)}
                      </tr>
                      <tr style={{ backgroundColor: r.color + "10" }}>
                        <td className="whitespace-nowrap px-1 py-0.5 text-slate-400">自費</td>
                        {r.jihi.map((v, m) => <Fragment key={m}>{cell(v)}</Fragment>)}
                        {cell(sum12(r.jihi), true)}
                      </tr>
                      <tr className="border-b" style={{ backgroundColor: r.color + "10" }}>
                        <td className="whitespace-nowrap px-1 py-0.5 font-bold text-slate-600">総計</td>
                        {sokei.map((v, m) => <Fragment key={m}>{cell(v, true)}</Fragment>)}
                        {cell(sum12(sokei), true)}
                      </tr>
                    </Fragment>
                  );
                })}
                {/* 集計行 */}
                {(() => {
                  const aggRow = (label: string, arr: number[], cls: string) => (
                    <tr className={`border-t ${cls}`}>
                      <td colSpan={2} className="whitespace-nowrap px-1.5 py-1 font-bold">{label}</td>
                      {arr.map((v, m) => (
                        <td key={m} className={`px-1 py-1 text-right tabnum font-bold ${v ? "" : "opacity-40"}`}>{v.toLocaleString()}</td>
                      ))}
                      <td className="px-1.5 py-1 text-right tabnum font-bold">{sum12(arr).toLocaleString()}</td>
                    </tr>
                  );
                  return (
                    <>
                      {aggRow("保険総計", yearData.hokenTotal, "bg-slate-50 text-slate-600")}
                      {aggRow("自費総計", yearData.jihiTotal, "bg-slate-50 text-slate-600")}
                      {aggRow("川西院", yearData.kawaM, "bg-indigo-50 text-indigo-700")}
                      {aggRow("体幹教室", yearData.taikanM, "bg-orange-50 text-orange-700")}
                      {aggRow("総合計", yearData.sougou, "bg-amber-50 text-amber-800")}
                      {aggRow("物販", yearData.busM, "bg-slate-50 text-slate-600")}
                      {aggRow("物販込総計", yearData.busKomi, "bg-amber-100 text-amber-900")}
                    </>
                  );
                })()}
              </tbody>
            </table>
            <p className="mt-2 px-1 text-[11px] text-slate-400">
              保険＝合計額（保険総額）／自費＝保険外／総計＝自費＋保険。川西院は自費＋保険。物販・その他は担当なしの入力分。‹ › で年を移動できます。
            </p>
          </div>
        )
      ) : loading ? (
        <p className="py-10 text-center text-sm text-slate-500">読み込み中…</p>
      ) : view === "month" ? (
        /* ===== 日計表（月）: レセコンと同じ並び ===== */
        <div>
        <div className="mb-1 flex items-center gap-2">
          <span className="text-sm font-bold text-slate-700">{monthLabel} 日計表</span>
          <button onClick={exportKeiriCsv}
            className="ml-auto rounded-md border border-slate-400 px-2 py-1 text-[11px] font-bold text-slate-600 active:bg-slate-100">
            ⬇️ 経理用CSV
          </button>
        </div>
        <div className="overflow-x-auto rounded-xl border bg-white">
          <table className="w-full whitespace-nowrap text-sm">
            <thead className="bg-slate-50 text-[11px] text-slate-500">
              <tr>
                <th className="px-2 py-2 text-left font-bold">日付</th>
                <th className="px-2 py-2 text-right font-bold">件数</th>
                <th className="px-2 py-2 text-right font-bold">新患</th>
                <th className="px-2 py-2 text-right font-bold">合計額</th>
                <th className="px-2 py-2 text-right font-bold">負担額</th>
                <th className="px-2 py-2 text-right font-bold">入金額</th>
                <th className="px-2 py-2 text-right font-bold">保険外1<span className="font-normal">(阿部)</span></th>
                <th className="px-2 py-2 text-right font-bold">保険外2<span className="font-normal">(澁谷)</span></th>
                <th className="px-2 py-2 text-right font-bold">保険外3<span className="font-normal">(萩原林体幹)</span></th>
                <th className="px-2 py-2 text-right font-bold">保険外4<span className="font-normal">(物販)</span></th>
                {kawa && <th className="border-l-2 border-indigo-200 px-2 py-2 text-right font-bold text-indigo-700">川西<span className="font-normal">(整体)</span></th>}
                <th className="border-l-2 border-emerald-200 px-2 py-2 text-right font-bold text-emerald-700">キャッシュレス</th>
                <th className="px-2 py-2 text-right font-bold text-emerald-700">現金売上</th>
              </tr>
            </thead>
            <tbody className="divide-y tabnum">
              {monthDaily.map(([dt, e]) => {
                const dd = new Date(dt + "T00:00:00");
                return (
                  <tr key={dt} className="cursor-pointer hover:bg-blue-50" onClick={() => { setDate(dt); setView("day"); }}>
                    <td className="px-2 py-1.5 text-left">{dd.getMonth() + 1}/{dd.getDate()}（{WEEKDAY_LABELS[dd.getDay()]}）</td>
                    <td className="px-2 py-1.5 text-right">{e.cnt}</td>
                    <td className="px-2 py-1.5 text-right">{e.shin}</td>
                    <td className="px-2 py-1.5 text-right">{e.ins.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right">{e.bur.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right">{e.bur.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right">{e.ho1.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right">{e.ho2.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right">{e.ho3.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right">{e.ho4.toLocaleString()}</td>
                    {kawa && <td className="border-l-2 border-indigo-100 px-2 py-1.5 text-right font-medium text-indigo-700">{e.kawa.toLocaleString()}</td>}
                    <td className="border-l-2 border-emerald-100 px-2 py-1.5 text-right text-emerald-700">{e.cashless.toLocaleString()}</td>
                    <td className="px-2 py-1.5 text-right text-emerald-700">{e.cash.toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 bg-amber-50 font-bold tabnum">
                <td className="px-2 py-2 text-left">月計</td>
                <td className="px-2 py-2 text-right">{monthSum.cnt}</td>
                <td className="px-2 py-2 text-right">{monthSum.shin}</td>
                <td className="px-2 py-2 text-right">{monthSum.ins.toLocaleString()}</td>
                <td className="px-2 py-2 text-right">{monthSum.bur.toLocaleString()}</td>
                <td className="px-2 py-2 text-right">{monthSum.bur.toLocaleString()}</td>
                <td className="px-2 py-2 text-right">{monthSum.ho1.toLocaleString()}</td>
                <td className="px-2 py-2 text-right">{monthSum.ho2.toLocaleString()}</td>
                <td className="px-2 py-2 text-right">{monthSum.ho3.toLocaleString()}</td>
                <td className="px-2 py-2 text-right">{monthSum.ho4.toLocaleString()}</td>
                {kawa && <td className="border-l-2 border-indigo-200 px-2 py-2 text-right text-indigo-700">{monthSum.kawa.toLocaleString()}</td>}
                <td className="border-l-2 border-emerald-200 px-2 py-2 text-right text-emerald-700">{monthSum.cashless.toLocaleString()}</td>
                <td className="px-2 py-2 text-right text-emerald-700">{monthSum.cash.toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </div>
        {/* 保険外3（萩原・林・体幹教室）の内訳（月計） */}
        {(bucket.hagi || bucket.haya || taikan) && (() => {
          const hg = spByStaff(bucket.hagi);
          const hy = spByStaff(bucket.haya);
          const tk = taikan ? spByStaff(taikan.id) : 0;
          const hgName = staff.find((s) => s.id === bucket.hagi)?.name ?? "萩原";
          const hyName = staff.find((s) => s.id === bucket.haya)?.name ?? "林";
          return (
            <div className="mt-2 inline-flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border bg-white px-4 py-2 text-sm">
              <span className="font-bold text-slate-700">保険外3（{hgName}・{hyName}・体幹教室）内訳</span>
              <span className="text-slate-500">{hgName} <b className="tabnum text-slate-800">{yen(hg)}</b></span>
              <span className="text-slate-500">{hyName} <b className="tabnum text-slate-800">{yen(hy)}</b></span>
              <span className="text-slate-500">体幹教室 <b className="tabnum text-slate-800">{yen(tk)}</b></span>
              <span className="font-bold text-blue-700">計 <span className="tabnum">{yen(hg + hy + tk)}</span></span>
            </div>
          );
        })()}
        </div>
      ) : (
        /* ===== 日別入力 ===== */
        <div>
          <div className="mb-1 flex flex-wrap items-center gap-2">
            <span className="text-sm font-bold text-slate-700">{d.getMonth() + 1}/{d.getDate()}（{WEEKDAY_LABELS[d.getDay()]}）</span>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              <button onClick={() => setPriceOpen(true)} className="rounded-md border border-slate-300 px-2 py-1 text-[11px] font-bold text-slate-500 active:bg-slate-100">料金設定</button>
              <button onClick={() => addManual()} className="rounded-md bg-blue-600 px-2 py-1 text-[11px] font-bold text-white active:bg-blue-700">＋ 物販/予約外</button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickReseko(f); e.target.value = ""; }} />
          </div>
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-[13px]">
              <thead className="bg-slate-50 text-[11px] text-slate-500">
                <tr>
                  <th className="px-1 py-1 text-left font-bold">担当</th>
                  <th className="px-2 py-1 text-left font-bold">名前</th>
                  <th className="px-1 py-1 text-right font-bold">保険外</th>
                  <th className="px-1 py-1 text-right font-bold">合計額</th>
                  <th className="px-1 py-1 text-right font-bold">負担額</th>
                  <th className="px-1 py-1 text-right font-bold">入金額</th>
                  <th className="px-2 py-1 text-right font-bold">総合計</th>
                  <th className="px-1 py-1 text-center font-bold">支払</th>
                  <th className="px-1 py-1"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {dayItems.map((it) =>
                  it.kind === "appt" ? (
                    (() => {
                      const a = it.a;
                      const s = apptVal(a);
                      return (
                        <tr key={a.id} ref={(el) => { rowRefs.current[a.id] = el; }} {...dragHandlers(a.id)}
                          className={rowClass(a.id, "cursor-grab select-none active:cursor-grabbing")} style={rowStyle(a.id)}>
                          <td className="px-1 py-0.5">
                            <select value={s.staff_id ?? ""} onChange={(e) => setApptField(a, "staff_id", e.target.value || null)} onBlur={() => persistAppt(a)}
                              className="rounded border px-1 py-0.5 text-[11px] font-bold" style={assigneeSelectStyle(s.staff_id)}>
                              <option value="" style={{ color: "#0f172a", background: "#fff" }}>-</option>
                              {assignees.map((st) => <option key={st.id} value={st.id} style={{ color: "#0f172a", background: "#fff" }}>{st.name}</option>)}
                            </select>
                          </td>
                          <td className="whitespace-nowrap px-2 py-0.5">
                            <div className="flex items-center gap-1.5">
                              <span className="font-medium text-slate-800">{a.patient_name || "（未登録）"}</span>
                              <span className="text-[10px] text-slate-400">{minToLabel(a.start_min)}</span>
                              {!(kawa && a.service_id === kawa.id) && (
                                <>
                                  <button onClick={() => setGaku((m) => ({ ...m, [a.id]: !isStudentAppt(a) }))}
                                    className={`rounded border px-1 py-0.5 text-[9px] font-bold ${isStudentAppt(a) ? "border-sky-300 bg-sky-50 text-sky-600" : "border-slate-200 text-slate-400"}`}>
                                    {isStudentAppt(a) ? "学生" : "一般"}
                                  </button>
                                  {(() => {
                                    const last = lastVisit[pkey(a)];
                                    if (last) { const dd = new Date(last + "T00:00:00"); return <span className="text-[9px] text-slate-400">前回{dd.getMonth() + 1}/{dd.getDate()}</span>; }
                                    return null;
                                  })()}
                                </>
                              )}
                            </div>
                          </td>
                          <td className="px-1 py-0.5 text-right">
                            <input type="number" min={0} placeholder={suggestSelf(a) ? String(suggestSelf(a)) : "0"} value={s.selfpay || ""}
                              onFocus={() => { if (!s.selfpay && suggestSelf(a) > 0) { setApptField(a, "selfpay", suggestSelf(a)); } }}
                              onChange={(e) => setApptField(a, "selfpay", parseInt(e.target.value || "0", 10))} onBlur={() => persistAppt(a)} data-amt="1" onKeyDown={onAmountKey} className={amt} />
                          </td>
                          <td className="px-1 py-0.5 text-right">
                            <input type="number" min={0} placeholder="0" value={s.insurance || ""}
                              onChange={(e) => setApptField(a, "insurance", parseInt(e.target.value || "0", 10))} onBlur={() => persistAppt(a)} data-amt="1" onKeyDown={onAmountKey} className={amt} />
                          </td>
                          <td className="px-1 py-0.5 text-right">
                            <input type="number" min={0} placeholder="0" value={s.burden || ""}
                              onChange={(e) => setApptField(a, "burden", parseInt(e.target.value || "0", 10))} onBlur={() => persistAppt(a)} data-amt="1" onKeyDown={onAmountKey} className={amt} />
                          </td>
                          <td className="px-1 py-0.5 text-right tabnum text-slate-500">{paid(s).toLocaleString()}</td>
                          <td className="px-2 py-0.5 text-right font-bold tabnum text-slate-800">{total(s).toLocaleString()}</td>
                          <td className="px-1 py-0.5 text-center">{payBtn(s.payment, () => toggleApptPayment(a))}</td>
                          <td className="whitespace-nowrap px-1 py-0.5 text-center">
                            {saleByAppt[a.id]
                              ? <button onClick={() => deleteApptSale(a)} className="text-[11px] font-bold text-red-400">売上削除</button>
                              : <button onClick={() => removeAppt(a)} className="text-[11px] font-bold text-red-400">予約削除</button>}
                          </td>
                        </tr>
                      );
                    })()
                  ) : (
                    (() => {
                      const m = it.m;
                      return (
                        <tr key={m.id} ref={(el) => { rowRefs.current[m.id] = el; }} {...dragHandlers(m.id)}
                          className={rowClass(m.id, "cursor-grab select-none active:cursor-grabbing")} style={rowStyle(m.id)}>
                          <td className="px-1 py-0.5">
                            <select value={m.staff_id ?? ""} onChange={(e) => { const sid = e.target.value || null; setManualLocal(m.id, { staff_id: sid, retail: !sid }); }} onBlur={() => persistManual(m.id)}
                              className="rounded border px-1 py-1 text-[11px] font-bold"
                              style={m.staff_id ? assigneeSelectStyle(m.staff_id) : { backgroundColor: "#64748b", color: "#fff", borderColor: "#64748b" }}>
                              <option value="" style={{ color: "#0f172a", background: "#fff" }}>物販</option>
                              {assignees.map((st) => <option key={st.id} value={st.id} style={{ color: "#0f172a", background: "#fff" }}>{st.name}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-0.5">
                            <div className="flex flex-col gap-0.5">
                              <input value={m.patient_name ?? ""} placeholder="商品名" onChange={(e) => setManualLocal(m.id, { patient_name: e.target.value })} onBlur={() => persistManual(m.id)}
                                className="w-28 rounded border border-slate-300 px-1 py-0.5 text-[13px]" />
                              <input value={m.retail_buyer ?? ""} placeholder="購入者" onChange={(e) => setManualLocal(m.id, { retail_buyer: e.target.value })} onBlur={() => persistManual(m.id)}
                                className="w-28 rounded border border-slate-200 px-1 py-0.5 text-[11px] text-slate-600" />
                            </div>
                          </td>
                          <td className="px-1 py-0.5 text-right">
                            <input type="number" min={0} placeholder="0" value={m.selfpay || ""} onChange={(e) => setManualLocal(m.id, { selfpay: parseInt(e.target.value || "0", 10) })} onBlur={() => persistManual(m.id)} data-amt="1" onKeyDown={onAmountKey} className={amt} />
                          </td>
                          <td className="px-1 py-0.5 text-right">
                            <input type="number" min={0} placeholder="0" value={m.insurance || ""} onChange={(e) => setManualLocal(m.id, { insurance: parseInt(e.target.value || "0", 10) })} onBlur={() => persistManual(m.id)} data-amt="1" onKeyDown={onAmountKey} className={amt} />
                          </td>
                          <td className="px-1 py-0.5 text-right">
                            <input type="number" min={0} placeholder="0" value={m.burden || ""} onChange={(e) => setManualLocal(m.id, { burden: parseInt(e.target.value || "0", 10) })} onBlur={() => persistManual(m.id)} data-amt="1" onKeyDown={onAmountKey} className={amt} />
                          </td>
                          <td className="px-1 py-0.5 text-right tabnum text-slate-500">{paid(m).toLocaleString()}</td>
                          <td className="px-2 py-0.5 text-right font-bold tabnum text-slate-800">{total(m).toLocaleString()}</td>
                          <td className="px-1 py-0.5 text-center">{payBtn(m.payment, () => toggleManualPayment(m))}</td>
                          <td className="whitespace-nowrap px-1 py-0.5 text-center">
                            <button onClick={() => deleteManual(m.id)} className="text-[11px] font-bold text-red-400">削除</button>
                          </td>
                        </tr>
                      );
                    })()
                  )
                )}
                {dayItems.length === 0 && (
                  <tr><td colSpan={9} className="px-3 py-8 text-center text-sm text-slate-400">この日の予約はありません（物販/予約外は右上の＋から）。</td></tr>
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 bg-amber-50 font-bold tabnum">
                  <td className="px-2 py-2 text-left" colSpan={2}>計 {daySum.cnt}件</td>
                  <td className="px-1 py-2 text-right">{daySum.sp.toLocaleString()}</td>
                  <td className="px-1 py-2 text-right">{daySum.ins.toLocaleString()}</td>
                  <td className="px-1 py-2 text-right">{daySum.bur.toLocaleString()}</td>
                  <td className="px-1 py-2 text-right">{daySum.paid.toLocaleString()}</td>
                  <td className="px-2 py-2 text-right">{daySum.gou.toLocaleString()}</td>
                  <td></td>
                  <td></td>
                </tr>
              </tfoot>
            </table>
          </div>
          {/* 当日の入金内訳（窓口額計＝現金＋キャッシュレス） */}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border bg-white px-4 py-2 text-sm">
            <span className="font-bold text-slate-700">窓口額計 <span className="tabnum text-slate-800">{yen(daySum.paid)}</span></span>
            <span className="text-slate-500">💴 現金 <b className="tabnum text-slate-800">{yen(daySum.cash)}</b></span>
            <span className="text-indigo-600">💳 キャッシュレス <b className="tabnum">{yen(daySum.cashless)}</b></span>
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-400">
        名前・担当は予約から自動。各人に 保険外(自費)・合計額(保険総額)・負担額 を入力すると、
        入金額(=自費+負担額)・総合計(=自費+合計額) と日計・月計が自動集計されます。物販や予約外は
        「＋物販/予約外」から。担当ごとの合計(自費+保険)で当月の達成率が出ます。
      </p>

      {/* 料金設定（自費の自動計算） */}
      {priceOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPriceOpen(false)} />
          <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-2xl bg-white sm:rounded-2xl">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <span className="text-base font-bold text-slate-800">料金設定（自費の自動計算）</span>
              <button onClick={() => setPriceOpen(false)} className="ml-auto text-slate-400">✕</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              <div className="overflow-x-auto rounded-lg border">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-[11px] text-slate-500">
                    <tr>
                      <th className="px-2 py-2 text-left font-bold">担当</th>
                      <th className="px-1 py-2 text-right font-bold">30分 初診</th>
                      <th className="px-1 py-2 text-right font-bold">30分 再診</th>
                      <th className="px-1 py-2 text-right font-bold">60分 初診</th>
                      <th className="px-1 py-2 text-right font-bold">60分 再診</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {staff.map((s) => {
                      const p = prices[s.id] ?? defaultPrices(s.name);
                      const cell = (key: keyof SelfPrices) => (
                        <td className="px-1 py-1 text-right">
                          <input type="number" min={0} value={p[key] || ""} onChange={(e) => setPrice(s.id, key, parseInt(e.target.value || "0", 10))}
                            className="w-20 rounded border border-slate-300 px-1 py-1 text-right text-sm tabnum" />
                        </td>
                      );
                      return (
                        <tr key={s.id}>
                          <td className="whitespace-nowrap px-2 py-1 font-bold text-slate-700">{s.name}</td>
                          {cell("p30f")}{cell("p30r")}{cell("p60f")}{cell("p60r")}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="mt-4">
                <div className="mb-1 text-sm font-bold text-slate-700">オプション加算</div>
                <div className="flex flex-wrap gap-x-4 gap-y-2 text-[12px] text-slate-600">
                  {([["tsuden_ippan", "全身通電 一般"], ["tsuden_gakusei", "全身通電 学生"], ["jikangai_ippan", "時間外 一般"], ["jikangai_gakusei", "時間外 学生"], ["taikan_price", "体幹教室 1回"], ["student_max_age", "学生とみなす年齢(以下)"]] as const).map(([key, label]) => (
                    <label key={key} className="flex items-center gap-1">
                      {label}
                      <input type="number" min={0} value={options[key] || ""} onChange={(e) => setOpt(key, parseInt(e.target.value || "0", 10))}
                        className="w-20 rounded border border-slate-300 px-1 py-1 text-right text-sm tabnum" />
                    </label>
                  ))}
                </div>
                <p className="mt-2 text-[11px] text-slate-400">時間外は20:30以降の予約に自動加算。通電は「全身通電」を含むメニューに自動加算。学生/一般は生年月日から自動判定（各行で切替可）。体幹教室は担当が自動で「体幹教室」になり、上の「体幹教室 1回」を金額に自動入力します（0なら金額なし）。</p>
              </div>
            </div>
            <div className="flex items-center gap-2 border-t px-4 py-3">
              <span className="text-[11px] text-slate-400">名前・担当は予約から自動。ここで設定した料金を参考に金額を入力します。</span>
              <button onClick={() => setPriceOpen(false)} className="ml-auto rounded-lg border px-3 py-1.5 text-sm text-slate-500">閉じる</button>
              <button onClick={persistPrices} className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-bold text-white active:bg-blue-700">保存</button>
            </div>
          </div>
        </div>
      )}

      {/* レセコン取込：確認画面 */}
      {ocrOpen && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => !ocrSaving && setOcrOpen(false)} />
          <div className="relative flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-2xl bg-white sm:rounded-2xl">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <span className="text-base font-bold text-slate-800">📷 レセコン取込</span>
              <span className="text-xs text-slate-400">{d.getMonth() + 1}/{d.getDate()}（{WEEKDAY_LABELS[d.getDay()]}）</span>
              <button onClick={() => !ocrSaving && setOcrOpen(false)} className="ml-auto text-slate-400">✕</button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
              {ocrBusy ? (
                <p className="py-12 text-center text-sm text-slate-500">読み取り中…（数秒かかります）</p>
              ) : ocrError ? (
                <p className="py-12 text-center text-sm text-red-500">{ocrError}</p>
              ) : (
                <>
                  {ocrNotes.length > 0 && (
                    <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 p-2 text-[12px] text-amber-800">
                      <div className="mb-0.5 font-bold">📝 手書きメモ</div>
                      {ocrNotes.map((n, i) => <div key={i}>・{n}</div>)}
                    </div>
                  )}
                  {ocrTotals && (() => {
                    const sum = ocrRows.reduce(
                      (a, r) => ({ insurance: a.insurance + (r.insurance || 0), burden: a.burden + (r.burden || 0), selfpay: a.selfpay + (r.selfpay || 0) }),
                      { insurance: 0, burden: 0, selfpay: 0 }
                    );
                    const chk = (label: string, got: number, want: number | null) => {
                      const ok = want == null || got === want;
                      return (
                        <span className={ok ? "text-slate-500" : "font-bold text-red-500"}>
                          {label} <span className="tabnum">{got.toLocaleString()}</span>
                          {want != null && (ok ? " ✓" : ` / 印字${want.toLocaleString()} ⚠`)}
                        </span>
                      );
                    };
                    return (
                      <div className="mb-3 flex flex-wrap gap-x-4 gap-y-1 rounded-lg border bg-slate-50 p-2 text-[12px]">
                        <span className="font-bold text-slate-600">検算</span>
                        {chk("合計額", sum.insurance, ocrTotals.insurance)}
                        {chk("負担額", sum.burden, ocrTotals.burden)}
                        {chk("保険外", sum.selfpay, ocrTotals.selfpay)}
                      </div>
                    );
                  })()}
                  {ocrRetail.length > 0 && (
                    <div className="mb-3 rounded-lg border border-amber-300 bg-amber-50/60 p-2">
                      <div className="mb-1 text-[12px] font-bold text-amber-800">🛍 物販として登録 <span className="font-normal text-amber-600">（保険外から差し引いて物販行に）</span></div>
                      <div className="space-y-1.5">
                        {ocrRetail.map((r, i) => (
                          <div key={i} className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-600">
                            <input type="checkbox" checked={r.on} onChange={(e) => setOcrRetailRow(i, { on: e.target.checked })} className="h-4 w-4" />
                            <input value={r.name} onChange={(e) => setOcrRetailRow(i, { name: e.target.value })} placeholder="氏名" className="w-24 rounded border border-slate-300 px-1 py-0.5" />
                            <input value={r.item} onChange={(e) => setOcrRetailRow(i, { item: e.target.value })} placeholder="品目" className="w-24 rounded border border-slate-300 px-1 py-0.5" />
                            <input type="number" value={r.amount || ""} onChange={(e) => setOcrRetailRow(i, { amount: parseInt(e.target.value || "0", 10) })} className="w-20 rounded border border-slate-300 px-1 py-0.5 text-right tabnum" />円
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="space-y-2">
                    {ocrRows.map((r, i) => (
                      <div key={i} className="rounded-lg border p-2">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-800">{r.name || "（氏名不明）"}</span>
                          <select value={r.apptId} onChange={(e) => setOcrRow(i, { apptId: e.target.value })}
                            className={`ml-auto max-w-[58%] rounded border px-1 py-1 text-[11px] ${r.apptId ? "border-slate-300 text-slate-700" : "border-red-300 text-red-500"}`}>
                            <option value="">取込まない</option>
                            {dayRows.map((a) => <option key={a.id} value={a.id}>{a.patient_name || "（未登録）"} {minToLabel(a.start_min)}</option>)}
                          </select>
                        </div>
                        {r.note && <div className="mt-1 text-[11px] text-amber-700">📝 {r.note}</div>}
                        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500">
                          <label className="flex items-center gap-1">合計額<input type="number" value={r.insurance || ""} onChange={(e) => setOcrRow(i, { insurance: parseInt(e.target.value || "0", 10) })} className="w-20 rounded border border-slate-300 px-1 py-0.5 text-right tabnum" /></label>
                          <label className="flex items-center gap-1">負担額<input type="number" value={r.burden || ""} onChange={(e) => setOcrRow(i, { burden: parseInt(e.target.value || "0", 10) })} className="w-20 rounded border border-slate-300 px-1 py-0.5 text-right tabnum" /></label>
                          <label className="flex items-center gap-1">保険外<input type="number" value={r.selfpay || ""} onChange={(e) => setOcrRow(i, { selfpay: parseInt(e.target.value || "0", 10) })} className="w-20 rounded border border-slate-300 px-1 py-0.5 text-right tabnum" /></label>
                        </div>
                      </div>
                    ))}
                    {ocrRows.length === 0 && <p className="py-8 text-center text-sm text-slate-400">行を読み取れませんでした。撮り直して再度お試しください。</p>}
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 border-t px-4 py-3">
              <span className="text-[11px] text-slate-400">
                予約 {ocrRows.filter((r) => r.apptId).length}件
                {ocrRetail.filter((r) => r.on && r.amount > 0).length > 0 && ` ・物販 ${ocrRetail.filter((r) => r.on && r.amount > 0).length}件`}
              </span>
              <button onClick={() => !ocrSaving && setOcrOpen(false)} className="ml-auto rounded-lg border px-3 py-1.5 text-sm text-slate-500">キャンセル</button>
              <button onClick={saveOcr} disabled={ocrBusy || ocrSaving || (ocrRows.every((r) => !r.apptId) && ocrRetail.every((r) => !r.on || r.amount <= 0))}
                className="rounded-lg bg-blue-600 px-4 py-1.5 text-sm font-bold text-white active:bg-blue-700 disabled:opacity-40">
                {ocrSaving ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
