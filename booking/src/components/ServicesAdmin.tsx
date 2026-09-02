"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  loadAllServices,
  loadAllStaff,
  loadEquipment,
  loadServicePrices,
  loadStaffServices,
} from "@/lib/data";
import type { Equipment, ServicePrice, ServiceWithSteps, Staff } from "@/lib/types";
import { totalDuration } from "@/lib/booking";

const CATEGORIES = ["施術メニュー", "体幹教室", "川西整体院", "その他"];

// 分 → "H:MM"（時間外の開始時刻表示用）
const minToHM = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
// "20:30, 21:00" → [1230, 1260]（分の配列）
function parseStartsText(txt: string): number[] {
  return txt
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => {
      const [h, mm] = x.split(":").map((n) => parseInt(n, 10));
      return h * 60 + (mm || 0);
    })
    .filter((n) => !isNaN(n));
}

interface StepDraft {
  name: string;
  duration_min: number;
  uses_staff: boolean;
  equipment_id: string; // "" = なし
  headcount: number;
  patient_visible: boolean;
}

const emptyStep = (): StepDraft => ({
  name: "",
  duration_min: 30,
  uses_staff: true,
  equipment_id: "",
  headcount: 1,
  patient_visible: false,
});

export default function ServicesAdmin() {
  const supabase = useMemo(() => createClient(), []);
  const [services, setServices] = useState<ServiceWithSteps[]>([]);
  const [equipment, setEquipment] = useState<Equipment[]>([]);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [links, setLinks] = useState<{ staff_id: string; service_id: string }[]>([]);
  const [prices, setPrices] = useState<ServicePrice[]>([]);
  // 編集中メニューの料金 { staffId: {ini, rep} }
  const [priceMap, setPriceMap] = useState<Record<string, { ini: string; rep: string }>>({});
  const [loading, setLoading] = useState(true);
  // メニューのドラッグ並び替え
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragDy, setDragDy] = useState(0);
  const dragStartY = useRef(0);
  const [drop, setDrop] = useState<{ id: string; after: boolean } | null>(null);
  const rowRefs = useRef<Record<string, HTMLDivElement | null>>({});

  const [editing, setEditing] = useState<ServiceWithSteps | "new" | null>(null);
  const [name, setName] = useState("");
  const [patientName, setPatientName] = useState("");
  const [desc, setDesc] = useState("");
  const [rec, setRec] = useState(false);
  const [capacity, setCapacity] = useState(1); // 2以上=定員制クラス
  const [category, setCategory] = useState(CATEGORIES[0]);
  const [published, setPublished] = useState(true);
  const [newBooking, setNewBooking] = useState(true);
  const [personal, setPersonal] = useState(false); // パーソナル回数券の対象
  const [personalMonths, setPersonalMonths] = useState("5"); // 有効期限（月）
  const [afterHours, setAfterHours] = useState(false); // 時間外予約メニュー（夜の固定枠）
  const [ahStartsText, setAhStartsText] = useState(""); // 時間外の開始時刻（"20:30, 21:00" 形式）
  const [shortDesc, setShortDesc] = useState("");
  const [badge, setBadge] = useState("");
  const [priceNote, setPriceNote] = useState("");
  const [imagePath, setImagePath] = useState("");
  const [uploading, setUploading] = useState(false);
  const [staffIds, setStaffIds] = useState<Set<string>>(new Set());
  const [steps, setSteps] = useState<StepDraft[]>([emptyStep()]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const [sv, eq, st, ls, pr] = await Promise.all([
      loadAllServices(supabase),
      loadEquipment(supabase),
      loadAllStaff(supabase),
      loadStaffServices(supabase),
      loadServicePrices(supabase),
    ]);
    setServices(sv);
    setEquipment(eq);
    setStaff(st.filter((s) => s.status !== "retired"));
    setLinks(ls);
    setPrices(pr);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    reload();
  }, [reload]);

  function openNew() {
    setEditing("new");
    setName("");
    setPatientName("");
    setDesc("");
    setRec(false);
    setCapacity(1);
    setCategory(CATEGORIES[0]);
    setPublished(true);
    setNewBooking(true);
    setPersonal(false);
    setPersonalMonths("5");
    setAfterHours(false);
    setAhStartsText("");
    setShortDesc("");
    setBadge("");
    setPriceNote("");
    setImagePath("");
    setStaffIds(new Set());
    setPriceMap({});
    setSteps([emptyStep()]);
    setError(null);
  }

  function openEdit(s: ServiceWithSteps) {
    setEditing(s);
    setName(s.name);
    setPatientName(s.patient_name || "");
    setDesc(s.description || "");
    setRec(s.recommended);
    setCapacity(s.capacity ?? 1);
    setCategory(s.category || CATEGORIES[0]);
    setPublished(s.published);
    setNewBooking(s.new_booking);
    setPersonal((s as unknown as { personal?: boolean }).personal ?? false);
    {
      const sp = s as unknown as { personal_valid_months?: number | null };
      setPersonalMonths(sp.personal_valid_months != null ? String(sp.personal_valid_months) : "5");
    }
    {
      const sa = s as unknown as { after_hours?: boolean; class_starts?: string | null };
      setAfterHours(sa.after_hours ?? false);
      const mins = (sa.class_starts || "").split(",").map((x) => parseInt(x.trim(), 10)).filter((n) => !isNaN(n));
      setAhStartsText(mins.map(minToHM).join(", "));
    }
    setShortDesc(s.short_desc || "");
    setBadge(s.badge || "");
    setPriceNote(s.price_note || "");
    setImagePath(s.image_path || "");
    setStaffIds(new Set(links.filter((l) => l.service_id === s.id).map((l) => l.staff_id)));
    const pm: Record<string, { ini: string; rep: string }> = {};
    prices
      .filter((p) => p.service_id === s.id)
      .forEach((p) => {
        pm[p.staff_id] = {
          ini: p.initial_price != null ? String(p.initial_price) : "",
          rep: p.repeat_price != null ? String(p.repeat_price) : "",
        };
      });
    setPriceMap(pm);
    setSteps(
      s.steps.map((st) => ({
        name: st.name,
        duration_min: st.duration_min,
        uses_staff: st.uses_staff,
        equipment_id: st.equipment_id || "",
        headcount: st.headcount,
        patient_visible: st.patient_visible ?? false,
      }))
    );
    setError(null);
  }

  function toggleStaff(id: string) {
    setStaffIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function updateStep(i: number, patch: Partial<StepDraft>) {
    setSteps((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  }

  async function uploadImage(file: File) {
    setUploading(true);
    setError(null);
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `menu-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("menu-images")
      .upload(path, file, { upsert: true, cacheControl: "3600", contentType: file.type });
    if (upErr) {
      setError(
        `画像アップロードに失敗しました：${upErr.message}（バケット "menu-images" 作成のSQLを実行済みか確認してください）`
      );
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("menu-images").getPublicUrl(path);
    setImagePath(data.publicUrl);
    setUploading(false);
  }

  async function save() {
    if (!name.trim()) {
      setError("メニュー名を入力してください");
      return;
    }
    if (steps.length === 0 || steps.some((s) => !s.name.trim() || s.duration_min <= 0)) {
      setError("各工程の名称と所要時間（分）を入力してください");
      return;
    }
    if (steps.some((s) => s.duration_min % 5 !== 0)) {
      setError("所要時間は5分単位で入力してください");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const fields = {
        name: name.trim(),
        patient_name: patientName.trim() || null,
        description: desc.trim() || null,
        recommended: rec,
        capacity: Math.max(1, capacity),
        category,
        published,
        new_booking: newBooking,
        personal,
        personal_valid_months: personal && personalMonths.trim() ? parseInt(personalMonths, 10) : null,
        short_desc: shortDesc.trim() || null,
        badge: badge.trim() || null,
        price_note: priceNote.trim() || null,
        image_path: imagePath.trim() || null,
        after_hours: afterHours,
        // class_starts は体幹教室のクラス開始時刻と共用のため、時間外のときだけ書き換える
        ...(afterHours ? { class_starts: parseStartsText(ahStartsText).join(",") || null } : {}),
      };
      let serviceId: string;
      if (editing === "new") {
        const { data, error } = await supabase
          .from("services")
          .insert({ ...fields, sort_order: rec ? 0 : services.length + 1 })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        serviceId = data.id;
      } else if (editing) {
        serviceId = editing.id;
        const { error } = await supabase.from("services").update(fields).eq("id", serviceId);
        if (error) throw new Error(error.message);
        await supabase.from("service_steps").delete().eq("service_id", serviceId);
      } else {
        return;
      }

      const rows = steps.map((s, i) => ({
        service_id: serviceId,
        step_order: i + 1,
        name: s.name.trim(),
        duration_min: s.duration_min,
        uses_staff: s.uses_staff,
        equipment_id: s.equipment_id || null,
        headcount: s.headcount,
        patient_visible: s.patient_visible,
      }));
      const { error: stepErr } = await supabase.from("service_steps").insert(rows);
      if (stepErr) throw new Error(stepErr.message);

      // 対応可能スタッフ（staff_services）を作り直し
      await supabase.from("staff_services").delete().eq("service_id", serviceId);
      const linkRows = [...staffIds].map((staff_id) => ({ staff_id, service_id: serviceId }));
      if (linkRows.length) await supabase.from("staff_services").insert(linkRows);

      // 料金（対応スタッフのうち入力があるものだけ）を作り直し
      await supabase.from("service_prices").delete().eq("service_id", serviceId);
      const priceRows = [...staffIds]
        .map((staff_id) => {
          const p = priceMap[staff_id];
          const ini = p && p.ini !== "" ? parseInt(p.ini, 10) : null;
          const rep = p && p.rep !== "" ? parseInt(p.rep, 10) : null;
          return { service_id: serviceId, staff_id, initial_price: ini, repeat_price: rep };
        })
        .filter((r) => r.initial_price != null || r.repeat_price != null);
      if (priceRows.length) await supabase.from("service_prices").insert(priceRows);

      setEditing(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラー");
    } finally {
      setBusy(false);
    }
  }

  async function togglePublished(s: ServiceWithSteps) {
    await supabase.from("services").update({ published: !s.published }).eq("id", s.id);
    reload();
  }

  async function remove(s: ServiceWithSteps) {
    if (!confirm(`「${s.name}」を削除しますか？`)) return;
    await supabase.from("services").delete().eq("id", s.id);
    reload();
  }

  // --- メニューのドラッグ並び替え ---
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
    for (const s of services) {
      const el = rowRefs.current[s.id];
      if (!el) continue;
      const r = el.getBoundingClientRect();
      if (y < r.top) { best = { id: s.id, after: false }; break; }
      if (y <= r.bottom) { best = { id: s.id, after: y > r.top + r.height / 2 }; break; }
      best = { id: s.id, after: true };
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
    const ids = services.map((s) => s.id).filter((x) => x !== cur);
    if (dr && dr.id !== cur) {
      let idx = ids.indexOf(dr.id);
      if (idx < 0) idx = ids.length;
      else if (dr.after) idx += 1;
      ids.splice(idx, 0, cur);
    } else {
      ids.splice(services.map((s) => s.id).indexOf(cur), 0, cur);
    }
    const byId = Object.fromEntries(services.map((s) => [s.id, s]));
    const reordered = ids.map((id) => byId[id]);
    setServices(reordered);
    await Promise.all(reordered.map((s, i) => supabase.from("services").update({ sort_order: i + 1 }).eq("id", s.id)));
  }

  if (loading) return <p className="py-8 text-center text-sm text-slate-500">読み込み中…</p>;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">メニュー・工程設定</h1>
        <button
          onClick={openNew}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white"
        >
          ＋ 新規メニュー
        </button>
      </div>

      <div className="space-y-2">
        {services.map((s) => (
          <div
            key={s.id}
            ref={(el) => { rowRefs.current[s.id] = el; }}
            className={`rounded-xl border bg-white p-3 ${s.published ? "" : "opacity-50"} ${dragId && dragId !== s.id && drop?.id === s.id ? (drop.after ? "shadow-[inset_0_-3px_0_0_#3b82f6]" : "shadow-[inset_0_3px_0_0_#3b82f6]") : ""}`}
            style={dragId === s.id ? { transform: `translateY(${dragDy}px)`, position: "relative", zIndex: 30, background: "#fff", boxShadow: "0 12px 28px rgba(0,0,0,.18)" } : undefined}
          >
            <div className="flex items-start gap-2">
              <span
                onPointerDown={(e) => onDragStart(e, s.id)}
                onPointerMove={onDragMove}
                onPointerUp={onDragEnd}
                onPointerCancel={onDragEnd}
                className="mt-0.5 shrink-0 cursor-grab touch-none select-none rounded border border-slate-200 px-1.5 py-1 text-base leading-none text-slate-400 active:cursor-grabbing"
                title="ドラッグで並び替え"
              >
                ⠿
              </span>
            <div className="flex min-w-0 flex-1 items-start justify-between gap-2">
              <div>
                <div className="font-bold text-slate-800">
                  {s.name}{" "}
                  {s.recommended && (
                    <span className="rounded-full bg-blue-600 px-2 py-0.5 align-middle text-[10px] font-bold text-white">
                      イチオシ
                    </span>
                  )}{" "}
                  {s.capacity > 1 && (
                    <span className="rounded-full bg-teal-600 px-2 py-0.5 align-middle text-[10px] font-bold text-white">
                      定員{s.capacity}名
                    </span>
                  )}{" "}
                  {!s.published && (
                    <span className="rounded-full bg-slate-400 px-2 py-0.5 align-middle text-[10px] font-bold text-white">
                      非公開
                    </span>
                  )}{" "}
                  {!s.new_booking && (
                    <span className="rounded-full bg-amber-500 px-2 py-0.5 align-middle text-[10px] font-bold text-white">
                      新規停止
                    </span>
                  )}{" "}
                  <span className="text-xs font-normal text-slate-400">
                    {s.category}・約{totalDuration(s.steps)}分
                  </span>
                </div>
                {s.description && (
                  <div className="text-xs text-slate-500">{s.description}</div>
                )}
                <ol className="mt-1 space-y-0.5">
                  {s.steps.map((st) => (
                    <li key={st.id} className="text-xs text-slate-600">
                      {st.step_order}. {st.name}（{st.duration_min}分）
                      {st.uses_staff && " 担当者"}
                      {st.equipment_id &&
                        ` 機器:${equipment.find((e) => e.id === st.equipment_id)?.name || "?"}`}
                    </li>
                  ))}
                </ol>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1 text-xs">
                <button onClick={() => openEdit(s)} className="text-blue-600">
                  編集
                </button>
                <button onClick={() => togglePublished(s)} className="text-slate-500">
                  {s.published ? "非公開に" : "公開する"}
                </button>
                <button onClick={() => remove(s)} className="text-red-500">
                  削除
                </button>
              </div>
            </div>
            </div>
          </div>
        ))}
      </div>

      {/* 編集フォーム */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-slate-800">
                {editing === "new" ? "新規メニュー" : "メニュー編集"}
              </h2>
              <button onClick={() => setEditing(null)} className="text-slate-400">
                ✕
              </button>
            </div>

            <div className="mb-2 grid grid-cols-2 gap-2">
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">メニュー名（内部）</span>
                <input value={name} onChange={(e) => setName(e.target.value)}
                  placeholder="施術30分＋全身通電20分" className="w-full rounded-md border px-2 py-1.5 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">患者向け表示名（任意）</span>
                <input value={patientName} onChange={(e) => setPatientName(e.target.value)}
                  placeholder={name || "未設定なら内部名"} className="w-full rounded-md border px-2 py-1.5 text-sm" />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">カテゴリー</span>
                <select value={category} onChange={(e) => setCategory(e.target.value)}
                  className="w-full rounded-md border px-2 py-1.5 text-sm">
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </label>
              <div className="flex flex-wrap items-end gap-3 text-sm">
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={published} onChange={(e) => setPublished(e.target.checked)} />公開</label>
                <label className="flex items-center gap-1.5"><input type="checkbox" checked={newBooking} onChange={(e) => setNewBooking(e.target.checked)} />新規受付</label>
                <label className="flex items-center gap-1.5" title="このメニューの予約をパーソナル回数券に自動反映（30分=1回・60分=2回）"><input type="checkbox" checked={personal} onChange={(e) => setPersonal(e.target.checked)} />パーソナル回数券</label>
                {capacity === 1 && (
                  <label className="flex items-center gap-1.5" title="20:30以降など夜の固定枠だけ予約できる時間外メニューにする。複数作ると患者が選べます"><input type="checkbox" checked={afterHours} onChange={(e) => setAfterHours(e.target.checked)} />時間外予約</label>
                )}
              </div>
              {afterHours && (
                <label className="block">
                  <span className="mb-1 block text-xs text-slate-500">時間外の開始時刻（カンマ区切り・例: 20:30, 21:00）</span>
                  <input value={ahStartsText} onChange={(e) => setAhStartsText(e.target.value)}
                    placeholder="20:30, 21:00" className="w-full rounded-md border px-2 py-1.5 text-sm" />
                </label>
              )}
            </div>
            <textarea
              value={desc}
              onChange={(e) => setDesc(e.target.value)}
              placeholder="詳細説明（確認画面などで使用・任意）"
              rows={2}
              className="mb-2 w-full rounded-md border px-2 py-1.5 text-sm"
            />

            {/* 一覧カード用：短い説明・バッジ・画像 */}
            <div className="mb-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-xs text-slate-500">一覧カードの短い説明（2〜3行）</span>
                <textarea
                  value={shortDesc}
                  onChange={(e) => setShortDesc(e.target.value)}
                  placeholder="例：まず全身通電で身体を整え、その後30分間の施術を行います。"
                  rows={2}
                  className="w-full rounded-md border px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">バッジ（例：基本／集中ケア）</span>
                <input
                  value={badge}
                  onChange={(e) => setBadge(e.target.value)}
                  placeholder="任意"
                  className="w-full rounded-md border px-2 py-1.5 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-slate-500">料金メモ（月謝制・加算など。カードに表示）</span>
                <input
                  value={priceNote}
                  onChange={(e) => setPriceNote(e.target.value)}
                  placeholder="例：月4回 ¥4,400 ／ フリーパス ¥8,150"
                  className="w-full rounded-md border px-2 py-1.5 text-sm"
                />
              </label>
            </div>

            <div className="mb-3">
              <span className="mb-1 block text-xs text-slate-500">メニュー画像（一覧カードに表示）</span>
              <div className="flex items-center gap-3">
                {imagePath ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={imagePath} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-xs text-slate-400">
                    なし
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-center text-xs font-medium text-slate-600 hover:bg-slate-50">
                    {uploading ? "アップロード中…" : "画像をアップロード"}
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      disabled={uploading}
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) uploadImage(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {imagePath && (
                    <button type="button" onClick={() => setImagePath("")} className="text-xs text-slate-400">
                      画像を削除
                    </button>
                  )}
                </div>
              </div>
              <input
                value={imagePath}
                onChange={(e) => setImagePath(e.target.value)}
                placeholder="またはURLを直接入力"
                className="mt-2 w-full rounded-md border px-2 py-1.5 text-sm"
              />
            </div>

            {/* 対応可能スタッフ（メニュー側からも設定できる）*/}
            <div className="mb-2">
              <span className="mb-1 block text-xs font-bold text-slate-600">
                対応できるスタッフ{capacity > 1 && "（定員制クラスは担当者不要）"}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {staff.map((s) => (
                  <button key={s.id} onClick={() => toggleStaff(s.id)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${staffIds.has(s.id) ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-600"}`}>
                    {s.display_name || s.name}
                  </button>
                ))}
              </div>
            </div>
            {/* パーソナル：有効期限（月）*/}
            {personal && (
              <div className="mb-2 rounded-lg border border-indigo-200 bg-indigo-50/50 p-2">
                <label className="flex items-center gap-1 text-xs font-bold text-indigo-700">有効期限
                  <input type="number" value={personalMonths} onChange={(e) => setPersonalMonths(e.target.value)} className="w-14 rounded border px-1.5 py-1" />ヶ月
                </label>
                <p className="mt-1 text-[10px] text-indigo-400">料金は下の「1回／10回分」をスタッフごとに入力。60分メニューは回数券から2回分消費されます。</p>
              </div>
            )}
            {/* 料金（スタッフ別）。パーソナルは「1回／10回分」、通常は「初診／再診」*/}
            {capacity === 1 && staffIds.size > 0 && (
              <div className="mb-2">
                <span className="mb-1 block text-xs font-bold text-slate-600">
                  {personal ? "料金（1回／10回分・スタッフ別）" : "料金（円・スタッフ別）"}
                </span>
                <div className="space-y-1">
                  {staff
                    .filter((s) => staffIds.has(s.id))
                    .map((s) => {
                      const p = priceMap[s.id] || { ini: "", rep: "" };
                      const set = (patch: Partial<{ ini: string; rep: string }>) =>
                        setPriceMap((prev) => ({ ...prev, [s.id]: { ...p, ...patch } }));
                      return (
                        <div key={s.id} className="flex items-center gap-2 text-xs">
                          <span className="w-12 shrink-0">{s.display_name || s.name}</span>
                          <label className="flex items-center gap-1">{personal ? "1回" : "初診"}
                            <input type="number" value={p.ini} onChange={(e) => set({ ini: e.target.value })}
                              className="w-20 rounded border px-1.5 py-1" />
                          </label>
                          <label className="flex items-center gap-1">{personal ? "10回分" : "再診"}
                            <input type="number" value={p.rep} onChange={(e) => set({ rep: e.target.value })}
                              className="w-24 rounded border px-1.5 py-1" />
                          </label>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
            <label className="mb-2 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={rec}
                onChange={(e) => setRec(e.target.checked)}
              />
              イチオシとして表示（一覧で強調・先頭に表示）
            </label>
            <label className="mb-1 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={capacity > 1}
                onChange={(e) => setCapacity(e.target.checked ? 4 : 1)}
              />
              定員制クラス（担当者なし・残り人数表示）
            </label>
            {capacity > 1 && (
              <label className="mb-3 ml-6 flex items-center gap-2 text-xs text-slate-600">
                定員
                <input
                  type="number"
                  min={2}
                  value={capacity}
                  onChange={(e) => setCapacity(parseInt(e.target.value || "2", 10))}
                  className="w-16 rounded-md border px-1.5 py-1"
                />
                名（各工程の「担当者を使用」は外してください）
              </label>
            )}

            <div className="mb-1 text-xs font-bold text-slate-600">
              工程（患者には表示されません。予約判定はこの順番で行います）
            </div>
            <div className="space-y-2">
              {steps.map((st, i) => (
                <div key={i} className="rounded-lg border p-2">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400">{i + 1}</span>
                    <input
                      value={st.name}
                      onChange={(e) => updateStep(i, { name: e.target.value })}
                      placeholder="工程名（例: 全身通電 / 施術）"
                      className="flex-1 rounded-md border px-2 py-1 text-sm"
                    />
                    {steps.length > 1 && (
                      <button
                        onClick={() => setSteps((p) => p.filter((_, x) => x !== i))}
                        className="text-xs text-red-500"
                      >
                        削除
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <label className="flex items-center gap-1">
                      所要
                      <input
                        type="number"
                        min={5}
                        step={5}
                        value={st.duration_min}
                        onChange={(e) =>
                          updateStep(i, { duration_min: parseInt(e.target.value || "0", 10) })
                        }
                        className="w-16 rounded-md border px-1.5 py-1"
                      />
                      分
                    </label>
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={st.uses_staff}
                        onChange={(e) => updateStep(i, { uses_staff: e.target.checked })}
                      />
                      担当者を使用
                    </label>
                    <label className="flex items-center gap-1">
                      機器
                      <select
                        value={st.equipment_id}
                        onChange={(e) => updateStep(i, { equipment_id: e.target.value })}
                        className="rounded-md border px-1.5 py-1"
                      >
                        <option value="">なし</option>
                        {equipment.map((e) => (
                          <option key={e.id} value={e.id}>
                            {e.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    {st.equipment_id && (
                      <label className="flex items-center gap-1">
                        利用人数
                        <input
                          type="number"
                          min={1}
                          value={st.headcount}
                          onChange={(e) =>
                            updateStep(i, { headcount: parseInt(e.target.value || "1", 10) })
                          }
                          className="w-14 rounded-md border px-1.5 py-1"
                        />
                      </label>
                    )}
                    <label className="flex items-center gap-1">
                      <input
                        type="checkbox"
                        checked={st.patient_visible}
                        onChange={(e) => updateStep(i, { patient_visible: e.target.checked })}
                      />
                      患者画面に表示
                    </label>
                  </div>
                </div>
              ))}
            </div>
            <button
              onClick={() => setSteps((p) => [...p, emptyStep()])}
              className="mt-2 w-full rounded-md border border-dashed py-1.5 text-sm text-slate-500"
            >
              ＋ 工程を追加
            </button>

            {error && <p className="mt-2 text-sm text-red-600">{error}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setEditing(null)}
                className="rounded-lg border px-4 py-2 text-sm text-slate-600"
              >
                閉じる
              </button>
              <button
                onClick={save}
                disabled={busy}
                className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white disabled:bg-slate-300"
              >
                {busy ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
