"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadAllStaff, loadServices } from "@/lib/data";
import { addDays, minToLabel, toDateStr, WEEKDAY_LABELS } from "@/lib/booking";
import type { Staff } from "@/lib/types";

const KAWANISHI_COLOR = "#3F51B5"; // 川西整体院のカラー（ボード/カレンダーに合わせる）

interface Appt {
  id: string;
  date: string;
  start_min: number;
  staff_id: string | null;
  service_id: string | null;
  patient_name: string | null;
}
interface Sale {
  id: string;
  appointment_id: string | null;
  date: string;
  staff_id: string | null;
  patient_name: string | null;
  selfpay: number; // 保険外（自費）
  insurance: number; // 合計額（保険総額）
  burden: number; // 負担額（窓口負担）
  anchor_appointment_id?: string | null; // 物販をこの予約(購入者)の下に置く
  sort_order?: number | null; // 手動並び替え用
}
const zeroSale = (): Omit<Sale, "id" | "appointment_id" | "date" | "staff_id" | "patient_name"> => ({
  selfpay: 0,
  insurance: 0,
  burden: 0,
});

// レセコン取込の確認行（写真の1行＝patient1件ぶん）
type OcrReviewRow = { name: string; insurance: number; burden: number; selfpay: number; note?: string | null; apptId: string };
type OcrTotals = { count: number | null; insurance: number | null; burden: number | null; selfpay: number | null };

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
  const [view, setView] = useState<"day" | "month">("day");
  const [date, setDate] = useState(() => toDateStr(new Date()));
  const [staff, setStaff] = useState<Staff[]>([]);
  const [kawa, setKawa] = useState<{ id: string; name: string; color: string } | null>(null);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const salesRef = useRef(sales);
  salesRef.current = sales;
  const [targets, setTargets] = useState<Record<string, number>>({});
  const [clinicTarget, setClinicTarget] = useState(0);
  const [loading, setLoading] = useState(true);
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
      const { data: cfg } = await supabase.from("settings").select("clinic_sales_target").eq("id", 1).maybeSingle();
      if (cfg) setClinicTarget((cfg as { clinic_sales_target?: number }).clinic_sales_target ?? 0);
    })();
  }, [supabase]);

  const reload = useCallback(async () => {
    setLoading(true);
    const [{ data: ap }, { data: sl }] = await Promise.all([
      supabase
        .from("appointments")
        .select("id, date, start_min, staff_id, service_id, patient_name")
        .neq("status", "cancelled")
        .gte("date", monthStart)
        .lt("date", monthEnd)
        .order("date")
        .order("start_min"),
      supabase
        .from("sales")
        .select("id, appointment_id, date, staff_id, patient_name, selfpay, insurance, burden, anchor_appointment_id, sort_order")
        .gte("date", monthStart)
        .lt("date", monthEnd),
    ]);
    setAppts((ap as Appt[]) ?? []);
    setSales((sl as Sale[]) ?? []);
    setLoading(false);
  }, [supabase, monthStart, monthEnd]);

  useEffect(() => {
    reload();
  }, [reload]);

  const saleByAppt = useMemo(() => {
    const m: Record<string, Sale> = {};
    sales.forEach((s) => {
      if (s.appointment_id) m[s.appointment_id] = s;
    });
    return m;
  }, [sales]);
  const manualSales = useMemo(() => sales.filter((s) => !s.appointment_id), [sales]);

  // 担当の選択肢（実スタッフ＋川西整体院）。realはスタッフ表に目標を持てる人。
  const assignees = useMemo(() => {
    const base = staff.map((s) => ({ id: s.id, name: s.name, color: s.color || "#64748b", real: true }));
    return kawa ? [...base, { id: kawa.id, name: kawa.name, color: kawa.color, real: false }] : base;
  }, [staff, kawa]);
  // 川西の予約は担当を「川西整体院」に自動割当
  const defStaffId = useCallback(
    (a: Appt) => (kawa && a.service_id === kawa.id ? kawa.id : a.staff_id),
    [kawa]
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
    reload();
  }

  // --- 手動行（物販・予約外） ---
  async function addManual(anchor?: string) {
    const { data } = await supabase
      .from("sales")
      .insert({ date, staff_id: null, patient_name: "", selfpay: 0, insurance: 0, burden: 0, anchor_appointment_id: anchor ?? null })
      .select("id, appointment_id, date, staff_id, patient_name, selfpay, insurance, burden, anchor_appointment_id")
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
      .update({ staff_id: s.staff_id, patient_name: s.patient_name, selfpay: s.selfpay, insurance: s.insurance, burden: s.burden })
      .eq("id", id);
  }
  async function deleteManual(id: string) {
    setSales((prev) => prev.filter((s) => s.id !== id));
    await supabase.from("sales").delete().eq("id", id);
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
        result?: { rows: { name?: string; insurance?: number | null; burden?: number | null; selfpay?: number | null; note?: string | null }[]; totals: OcrTotals; notes?: string[] };
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
    } catch {
      setOcrError("画像の処理に失敗しました。");
    } finally {
      setOcrBusy(false);
    }
  }
  function setOcrRow(i: number, patch: Partial<OcrReviewRow>) {
    setOcrRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }
  async function saveOcr() {
    setOcrSaving(true);
    // 同じ予約にマッチした複数行（保険＋自費など）は合算
    const byAppt = new Map<string, { insurance: number; burden: number; selfpay: number }>();
    ocrRows.forEach((r) => {
      if (!r.apptId) return;
      const cur = byAppt.get(r.apptId) ?? { insurance: 0, burden: 0, selfpay: 0 };
      cur.insurance += r.insurance || 0;
      cur.burden += r.burden || 0;
      cur.selfpay += r.selfpay || 0;
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
    setOcrSaving(false);
    setOcrOpen(false);
    setOcrRows([]);
    reload();
  }

  // --- 集計 ---
  const total = (s: { selfpay: number; insurance: number }) => s.selfpay + s.insurance; // 合計
  const paid = (s: { selfpay: number; burden: number }) => s.selfpay + s.burden; // 入金額
  const staffTotal = useCallback(
    (staffId: string | null) =>
      sales.reduce((sum, s) => (s.staff_id === staffId ? sum + total(s) : sum), 0),
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

  // 当日の行（予約＋手動）
  const dayRows = useMemo(() => {
    const aps = appts.filter((a) => a.date === date);
    return aps;
  }, [appts, date]);
  const dayManual = useMemo(() => manualSales.filter((s) => s.date === date), [manualSales, date]);
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
  const grip = (id: string) => (
    <span
      onPointerDown={(e) => onDragStart(e, id)}
      onPointerMove={onDragMove}
      onPointerUp={onDragEnd}
      onPointerCancel={onDragEnd}
      className={`inline-flex cursor-grab touch-none select-none rounded-md border px-1.5 py-1 text-lg leading-none active:cursor-grabbing ${
        dragId === id ? "border-blue-400 bg-blue-50 text-blue-500" : "border-slate-200 text-slate-400 active:bg-slate-100"
      }`}
      title="ドラッグで並び替え"
    >
      ⠿
    </span>
  );
  // 担当スタッフのカラーで薄く色付け（#rrggbb に約9%のアルファを付与）
  const tintFor = (staffId: string | null): string | undefined => {
    const c = assignees.find((s) => s.id === staffId)?.color;
    return c && /^#[0-9a-f]{6}$/i.test(c) ? c + "18" : undefined;
  };
  // ドラッグ中の行は「浮き上がって」指に追従、落とし先には青いライン
  const rowStyle = (id: string, staffId: string | null): React.CSSProperties => {
    if (dragId === id)
      return {
        transform: `translateY(${dragDy}px)`,
        position: "relative",
        zIndex: 30,
        background: "#fff",
        boxShadow: "0 12px 28px rgba(0,0,0,.20), inset 0 0 0 2px #60a5fa",
      };
    const t = tintFor(staffId);
    return t ? { background: t } : {};
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
    let sp = 0, ins = 0, bur = 0, cnt = 0;
    dayRows.forEach((a) => {
      const s = saleByAppt[a.id];
      if (s) { sp += s.selfpay; ins += s.insurance; bur += s.burden; }
      cnt++;
    });
    dayManual.forEach((s) => { sp += s.selfpay; ins += s.insurance; bur += s.burden; cnt++; });
    return { sp, ins, bur, cnt, paid: sp + bur, gou: sp + ins };
  }, [dayRows, dayManual, saleByAppt]);

  // 保険外の担当バケット（1=阿部/2=澁谷/3=萩原・林/4=物販・その他）
  const bucket = useMemo(() => {
    const find = (...kw: string[]) => staff.find((s) => kw.some((k) => s.name.includes(k)))?.id ?? null;
    return { abe: find("阿部"), shibu: find("澁谷", "渋谷"), hagi: find("萩原"), haya: find("林") };
  }, [staff]);

  type DayAgg = { cnt: number; shin: number; ins: number; bur: number; ho1: number; ho2: number; ho3: number; ho4: number; kawa: number };
  // 日計表（月）：レセコン（茨木本院）と同じ並び＋川西整体院は独立列
  const monthDaily = useMemo(() => {
    const map = new Map<string, DayAgg>();
    const get = (dt: string) => {
      let e = map.get(dt);
      if (!e) { e = { cnt: 0, shin: 0, ins: 0, bur: 0, ho1: 0, ho2: 0, ho3: 0, ho4: 0, kawa: 0 }; map.set(dt, e); }
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
      const e = get(s.date);
      if (kawa && s.staff_id === kawa.id) { e.kawa += s.selfpay + s.insurance; return; }
      e.ins += s.insurance;
      e.bur += s.burden;
      if (s.staff_id && s.staff_id === bucket.abe) e.ho1 += s.selfpay;
      else if (s.staff_id && s.staff_id === bucket.shibu) e.ho2 += s.selfpay;
      else if (s.staff_id && (s.staff_id === bucket.hagi || s.staff_id === bucket.haya)) e.ho3 += s.selfpay;
      else e.ho4 += s.selfpay;
    });
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [appts, sales, bucket, kawa]);
  const monthSum = useMemo(
    () =>
      monthDaily.reduce(
        (acc, [, e]) => ({
          cnt: acc.cnt + e.cnt, shin: acc.shin + e.shin, ins: acc.ins + e.ins, bur: acc.bur + e.bur,
          ho1: acc.ho1 + e.ho1, ho2: acc.ho2 + e.ho2, ho3: acc.ho3 + e.ho3, ho4: acc.ho4 + e.ho4, kawa: acc.kawa + e.kawa,
        }),
        { cnt: 0, shin: 0, ins: 0, bur: 0, ho1: 0, ho2: 0, ho3: 0, ho4: 0, kawa: 0 }
      ),
    [monthDaily]
  );
  const monthSp = monthSum.ho1 + monthSum.ho2 + monthSum.ho3 + monthSum.ho4;

  const btn = "flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-500 active:bg-slate-100";
  const amt = "w-[68px] rounded border border-slate-300 px-1 py-1 text-right text-sm tabnum focus:border-blue-400 focus:outline-none";

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800">個別売上</h1>
        <div className="inline-flex rounded-md border border-slate-300 bg-white p-0.5">
          {([["day", "日別入力"], ["month", "日計表(月)"]] as const).map(([v, l]) => (
            <button key={v} onClick={() => setView(v)}
              className={`rounded px-2 py-1 text-[11px] font-bold ${view === v ? "bg-blue-600 text-white" : "text-slate-600"}`}>
              {l}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setDate(toDateStr(addDays(d, view === "month" ? -31 : -1)))} className={btn}>‹</button>
          <button onClick={() => setDate(toDateStr(new Date()))} className="rounded-md bg-blue-600 px-2 py-1 text-[11px] font-bold text-white active:bg-blue-700">今日</button>
          <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)}
            className="rounded-md border border-slate-300 px-1 py-1 text-[12px] text-slate-600" />
          <button onClick={() => setDate(toDateStr(addDays(d, view === "month" ? 31 : 1)))} className={btn}>›</button>
        </div>
      </div>

      {/* 当月サマリー（担当ごとの総売上＝自費＋保険 vs 目標） */}
      <div className="mb-4 rounded-xl border bg-white p-3">
        {(() => {
          const clinicTotal = monthSp + monthSum.kawa + monthSum.ins;
          const pct = clinicTarget > 0 ? Math.round((clinicTotal / clinicTarget) * 1000) / 10 : 0;
          return (
            <>
              <div className="mb-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                <span className="font-bold text-slate-700">{monthLabel} 当月</span>
                <span className="text-slate-500">保険 <b className="tabnum text-slate-700">{yen(monthSum.ins)}</b></span>
                <span className="text-slate-500">自費 <b className="tabnum text-slate-700">{yen(monthSp + monthSum.kawa)}</b></span>
                <span className="ml-auto flex items-center gap-1.5 text-[11px] text-slate-400">
                  院目標
                  <input type="number" min={0} value={clinicTarget ? clinicTarget / 10000 : ""} placeholder="0"
                    onChange={(e) => saveClinicTarget(parseFloat(e.target.value || "0"))}
                    className="w-16 rounded border border-slate-300 px-1 py-0.5 text-right text-[11px]" />万
                </span>
              </div>
              <div className="mb-2 flex items-baseline gap-2">
                <span className="text-lg font-bold tabnum text-slate-800">総売上 {yen(clinicTotal)}</span>
                {clinicTarget > 0 && (
                  <span className={`text-sm font-bold ${pct >= 100 ? "text-emerald-600" : pct >= 70 ? "text-blue-600" : "text-slate-500"}`}>{pct}%</span>
                )}
              </div>
              {clinicTarget > 0 && (
                <div className="mb-3 h-2 overflow-hidden rounded-full bg-slate-100">
                  <div className="h-full rounded-full bg-blue-600" style={{ width: `${Math.min(100, pct)}%` }} />
                </div>
              )}
            </>
          );
        })()}
        <div className="grid gap-2 sm:grid-cols-2">
          {assignees.map((s) => {
            const tot = staffTotal(s.id);
            const target = targets[s.id] ?? 0;
            const pct = target > 0 ? Math.round((tot / target) * 1000) / 10 : 0;
            return (
              <div key={s.id} className="rounded-lg border p-2">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: s.color }} />
                  <span className="text-sm font-bold text-slate-800">{s.name}</span>
                  {s.real && (
                    <span className="ml-auto flex items-center gap-1 text-[11px] text-slate-400">
                      目標
                      <input type="number" min={0} value={target ? target / 10000 : ""} placeholder="0"
                        onChange={(e) => saveTarget(s.id, parseFloat(e.target.value || "0"))}
                        className="w-14 rounded border border-slate-300 px-1 py-0.5 text-right text-[11px]" />万
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-baseline gap-2">
                  <span className="text-base font-bold tabnum text-slate-800">{yen(tot)}</span>
                  {target > 0 && <span className={`text-xs font-bold ${pct >= 100 ? "text-emerald-600" : pct >= 70 ? "text-blue-600" : "text-slate-500"}`}>{pct}%</span>}
                </div>
                {target > 0 && (
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: `${Math.min(100, pct)}%`, backgroundColor: s.color }} />
                  </div>
                )}
              </div>
            );
          })}
          <div className="rounded-lg border p-2">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-amber-500" />
              <span className="text-sm font-bold text-slate-800">物販・その他</span>
            </div>
            <div className="mt-1 text-base font-bold tabnum text-slate-800">{yen(staffTotal(null))}</div>
          </div>
        </div>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-slate-500">読み込み中…</p>
      ) : view === "month" ? (
        /* ===== 日計表（月）: レセコンと同じ並び ===== */
        <div>
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
                <th className="px-2 py-2 text-right font-bold">保険外3<span className="font-normal">(萩原林)</span></th>
                <th className="px-2 py-2 text-right font-bold">保険外4<span className="font-normal">(物販)</span></th>
                {kawa && <th className="border-l-2 border-indigo-200 px-2 py-2 text-right font-bold text-indigo-700">川西<span className="font-normal">(整体)</span></th>}
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
              </tr>
            </tfoot>
          </table>
        </div>
        {/* 保険外3（萩原・林）の内訳（月計） */}
        {(bucket.hagi || bucket.haya) && (() => {
          const hg = spByStaff(bucket.hagi);
          const hy = spByStaff(bucket.haya);
          const hgName = staff.find((s) => s.id === bucket.hagi)?.name ?? "萩原";
          const hyName = staff.find((s) => s.id === bucket.haya)?.name ?? "林";
          return (
            <div className="mt-2 inline-flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border bg-white px-4 py-2 text-sm">
              <span className="font-bold text-slate-700">保険外3（{hgName}・{hyName}）内訳</span>
              <span className="text-slate-500">{hgName} <b className="tabnum text-slate-800">{yen(hg)}</b></span>
              <span className="text-slate-500">{hyName} <b className="tabnum text-slate-800">{yen(hy)}</b></span>
              <span className="font-bold text-blue-700">計 <span className="tabnum">{yen(hg + hy)}</span></span>
            </div>
          );
        })()}
        </div>
      ) : (
        /* ===== 日別入力 ===== */
        <div>
          <div className="mb-1 flex items-center gap-2">
            <span className="text-sm font-bold text-slate-700">{d.getMonth() + 1}/{d.getDate()}（{WEEKDAY_LABELS[d.getDay()]}）</span>
            <div className="ml-auto flex items-center gap-2">
              <button onClick={() => fileRef.current?.click()} className="rounded-md border border-blue-600 px-2 py-1 text-[11px] font-bold text-blue-600 active:bg-blue-50">📷 レセコン取込</button>
              <button onClick={() => addManual()} className="rounded-md bg-blue-600 px-2 py-1 text-[11px] font-bold text-white active:bg-blue-700">＋ 物販/予約外</button>
            </div>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onPickReseko(f); e.target.value = ""; }} />
          </div>
          <div className="overflow-x-auto rounded-xl border bg-white">
            <table className="w-full text-sm">
              <thead className="bg-slate-50 text-[11px] text-slate-500">
                <tr>
                  <th className="px-1 py-2 text-left font-bold">担当</th>
                  <th className="px-2 py-2 text-left font-bold">名前</th>
                  <th className="px-1 py-2 text-right font-bold">保険外</th>
                  <th className="px-1 py-2 text-right font-bold">合計額</th>
                  <th className="px-1 py-2 text-right font-bold">負担額</th>
                  <th className="px-1 py-2 text-right font-bold">入金額</th>
                  <th className="px-2 py-2 text-right font-bold">合計</th>
                  <th className="px-1 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {dayItems.map((it) =>
                  it.kind === "appt" ? (
                    (() => {
                      const a = it.a;
                      const s = apptVal(a);
                      return (
                        <tr key={a.id} ref={(el) => { rowRefs.current[a.id] = el; }}
                          className={rowClass(a.id)} style={rowStyle(a.id, s.staff_id)}>
                          <td className="px-1 py-1">
                            <select value={s.staff_id ?? ""} onChange={(e) => setApptField(a, "staff_id", e.target.value || null)} onBlur={() => persistAppt(a)}
                              className="rounded border border-slate-200 px-0.5 py-1 text-[11px]">
                              <option value="">-</option>
                              {assignees.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                            </select>
                          </td>
                          <td className="whitespace-nowrap px-2 py-1">
                            <span className="font-medium text-slate-800">{a.patient_name || "（未登録）"}</span>
                            <span className="ml-1 text-[10px] text-slate-400">{minToLabel(a.start_min)}</span>
                          </td>
                          <td className="px-1 py-1 text-right">
                            <input type="number" min={0} placeholder="0" value={s.selfpay || ""}
                              onChange={(e) => setApptField(a, "selfpay", parseInt(e.target.value || "0", 10))} onBlur={() => persistAppt(a)} className={amt} />
                          </td>
                          <td className="px-1 py-1 text-right">
                            <input type="number" min={0} placeholder="0" value={s.insurance || ""}
                              onChange={(e) => setApptField(a, "insurance", parseInt(e.target.value || "0", 10))} onBlur={() => persistAppt(a)} className={amt} />
                          </td>
                          <td className="px-1 py-1 text-right">
                            <input type="number" min={0} placeholder="0" value={s.burden || ""}
                              onChange={(e) => setApptField(a, "burden", parseInt(e.target.value || "0", 10))} onBlur={() => persistAppt(a)} className={amt} />
                          </td>
                          <td className="px-1 py-1 text-right tabnum text-slate-500">{paid(s).toLocaleString()}</td>
                          <td className="px-2 py-1 text-right font-bold tabnum text-slate-800">{total(s).toLocaleString()}</td>
                          <td className="px-1 py-1 text-center">{grip(a.id)}</td>
                        </tr>
                      );
                    })()
                  ) : (
                    (() => {
                      const m = it.m;
                      return (
                        <tr key={m.id} ref={(el) => { rowRefs.current[m.id] = el; }}
                          className={rowClass(m.id)} style={rowStyle(m.id, m.staff_id)}>
                          <td className="px-1 py-1">
                            <select value={m.staff_id ?? ""} onChange={(e) => setManualLocal(m.id, { staff_id: e.target.value || null })} onBlur={() => persistManual(m.id)}
                              className="rounded border border-slate-200 px-0.5 py-1 text-[11px]">
                              <option value="">物販</option>
                              {assignees.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
                            </select>
                          </td>
                          <td className="px-2 py-1">
                            <input value={m.patient_name ?? ""} placeholder="品目/名前" onChange={(e) => setManualLocal(m.id, { patient_name: e.target.value })} onBlur={() => persistManual(m.id)}
                              className="w-24 rounded border border-slate-300 px-1 py-1 text-sm" />
                          </td>
                          <td className="px-1 py-1 text-right">
                            <input type="number" min={0} placeholder="0" value={m.selfpay || ""} onChange={(e) => setManualLocal(m.id, { selfpay: parseInt(e.target.value || "0", 10) })} onBlur={() => persistManual(m.id)} className={amt} />
                          </td>
                          <td className="px-1 py-1 text-right">
                            <input type="number" min={0} placeholder="0" value={m.insurance || ""} onChange={(e) => setManualLocal(m.id, { insurance: parseInt(e.target.value || "0", 10) })} onBlur={() => persistManual(m.id)} className={amt} />
                          </td>
                          <td className="px-1 py-1 text-right">
                            <input type="number" min={0} placeholder="0" value={m.burden || ""} onChange={(e) => setManualLocal(m.id, { burden: parseInt(e.target.value || "0", 10) })} onBlur={() => persistManual(m.id)} className={amt} />
                          </td>
                          <td className="px-1 py-1 text-right tabnum text-slate-500">{paid(m).toLocaleString()}</td>
                          <td className="px-2 py-1 text-right font-bold tabnum text-slate-800">{total(m).toLocaleString()}</td>
                          <td className="whitespace-nowrap px-1 py-1 text-center">
                            {grip(m.id)}
                            <button onClick={() => deleteManual(m.id)} className="ml-1 text-[11px] font-bold text-red-400">削除</button>
                          </td>
                        </tr>
                      );
                    })()
                  )
                )}
                {dayItems.length === 0 && (
                  <tr><td colSpan={8} className="px-3 py-8 text-center text-sm text-slate-400">この日の予約はありません（物販/予約外は右上の＋から）。</td></tr>
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
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      <p className="mt-3 text-[11px] text-slate-400">
        名前・担当は予約から自動。各人に 保険外(自費)・合計額(保険総額)・負担額 を入力すると、
        入金額(=自費+負担額)・合計(=自費+合計額) と日計・月計が自動集計されます。物販や予約外は
        「＋物販/予約外」から。担当ごとの合計(自費+保険)で当月の達成率が出ます。レセコンの日計表は
        「📷 レセコン取込」で写真から自動入力できます（担当は予約から自動）。
      </p>

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
              <span className="text-[11px] text-slate-400">{ocrRows.filter((r) => r.apptId).length}件を予約に反映</span>
              <button onClick={() => !ocrSaving && setOcrOpen(false)} className="ml-auto rounded-lg border px-3 py-1.5 text-sm text-slate-500">キャンセル</button>
              <button onClick={saveOcr} disabled={ocrBusy || ocrSaving || ocrRows.every((r) => !r.apptId)}
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
