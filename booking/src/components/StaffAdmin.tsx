"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  loadAllStaff,
  loadSchedules,
  loadServices,
  loadStaffServices,
} from "@/lib/data";
import type {
  ServiceWithSteps,
  Staff,
  StaffSchedule,
  StaffStatus,
} from "@/lib/types";
import { labelToMin, minToLabel, WEEKDAY_LABELS } from "@/lib/booking";

const STATUS_LABELS: Record<StaffStatus, string> = {
  active: "在籍中",
  paused: "休止中",
  retired: "退職",
  hidden: "非表示",
};

// グレー系（彩度が低い/白黒に近い）判定：スタッフカラーには使わせない
function isGrayish(hex: string): boolean {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return false;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  return sat < 0.15; // 彩度が低い＝グレー扱い
}

const PALETTE = [
  "#2563eb", "#16a34a", "#7c3aed", "#ea580c",
  "#dc2626", "#0d9488", "#db2777", "#4f46e5",
  "#ca8a04", "#0891b2", "#65a30d", "#e11d48",
];

// 曜日ごとの勤務セグメント（最大2枠）
type DaySeg = { on: boolean; a1: string; b1: string; a2: string; b2: string };
const emptyDay = (): DaySeg => ({ on: false, a1: "10:00", b1: "13:00", a2: "16:00", b2: "20:00" });

export default function StaffAdmin() {
  const supabase = useMemo(() => createClient(), []);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [services, setServices] = useState<ServiceWithSteps[]>([]);
  const [links, setLinks] = useState<{ staff_id: string; service_id: string }[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<Staff | "new" | null>(null);
  // フォーム
  const [f, setF] = useState({
    name: "", name_kana: "", display_name: "", role: "therapist",
    color: "#2563eb", status: "active" as StaffStatus,
    bookable: true, patient_visible: true, admin_visible: true,
    clinic: "", bio: "", note: "", image_path: "",
  });
  const [days, setDays] = useState<DaySeg[]>(Array.from({ length: 7 }, emptyDay));
  const [menuIds, setMenuIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    const [st, sv, ls] = await Promise.all([
      loadAllStaff(supabase),
      loadServices(supabase),
      loadStaffServices(supabase),
    ]);
    setStaff(st);
    setServices(sv);
    setLinks(ls);
    setLoading(false);
  }, [supabase]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function openEdit(s: Staff | "new") {
    setEditing(s);
    setError(null);
    if (s === "new") {
      setF({
        name: "", name_kana: "", display_name: "", role: "therapist",
        color: PALETTE[staff.length % PALETTE.length], status: "active",
        bookable: true, patient_visible: true, admin_visible: true,
        clinic: "", bio: "", note: "", image_path: "",
      });
      setDays(Array.from({ length: 7 }, emptyDay));
      setMenuIds(new Set());
      return;
    }
    setF({
      name: s.name, name_kana: s.name_kana || "", display_name: s.display_name || "",
      role: s.role, color: s.color || "#2563eb", status: s.status,
      bookable: s.bookable, patient_visible: s.patient_visible, admin_visible: s.admin_visible,
      clinic: s.clinic || "", bio: s.bio || "", note: s.note || "", image_path: s.image_path || "",
    });
    // 勤務時間を読み込みフォームへ
    const sc = await loadSchedules(supabase, s.id);
    const nd = Array.from({ length: 7 }, emptyDay);
    for (let wd = 0; wd < 7; wd++) {
      const rows = sc.filter((r) => r.weekday === wd).sort((a, b) => a.start_min - b.start_min);
      if (rows.length > 0) {
        nd[wd] = {
          on: true,
          a1: minToLabel(rows[0].start_min), b1: minToLabel(rows[0].end_min),
          a2: rows[1] ? minToLabel(rows[1].start_min) : "",
          b2: rows[1] ? minToLabel(rows[1].end_min) : "",
        };
      }
    }
    setDays(nd);
    setMenuIds(new Set(links.filter((l) => l.staff_id === s.id).map((l) => l.service_id)));
  }

  function toggleMenu(id: string) {
    setMenuIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function uploadPhoto(file: File) {
    setUploading(true);
    setError(null);
    const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
    const path = `staff-${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("staff-photos")
      .upload(path, file, { upsert: true, cacheControl: "3600", contentType: file.type });
    if (upErr) {
      setError(
        `画像アップロードに失敗しました：${upErr.message}（バケット "staff-photos" 作成のSQLを実行済みか確認してください）`
      );
      setUploading(false);
      return;
    }
    const { data } = supabase.storage.from("staff-photos").getPublicUrl(path);
    setF((prev) => ({ ...prev, image_path: data.publicUrl }));
    setUploading(false);
  }

  async function save() {
    if (!f.name.trim()) {
      setError("スタッフ名を入力してください");
      return;
    }
    if (isGrayish(f.color)) {
      setError("⚠ グレーは休診・勤務外専用です。スタッフカラーには別の色を選んでください。");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = {
        name: f.name.trim(),
        name_kana: f.name_kana.trim() || null,
        display_name: f.display_name.trim() || f.name.trim(),
        role: f.role,
        color: f.color,
        status: f.status,
        active: f.status === "active",
        bookable: f.bookable,
        patient_visible: f.patient_visible,
        admin_visible: f.admin_visible,
        clinic: f.clinic.trim() || null,
        bio: f.bio.trim() || null,
        image_path: f.image_path.trim() || null,
        note: f.note.trim() || null,
      };
      let staffId: string;
      if (editing === "new") {
        const maxOrder = staff.reduce((m, s) => Math.max(m, s.sort_order), 0);
        const { data, error } = await supabase
          .from("staff")
          .insert({ ...payload, sort_order: maxOrder + 1 })
          .select("id")
          .single();
        if (error) throw new Error(error.message);
        staffId = data.id;
      } else if (editing) {
        staffId = editing.id;
        const { error } = await supabase.from("staff").update(payload).eq("id", staffId);
        if (error) throw new Error(error.message);
      } else return;

      // 勤務時間を保存（作り直し）
      await supabase.from("staff_schedules").delete().eq("staff_id", staffId);
      const rows: Omit<StaffSchedule, "id">[] = [];
      days.forEach((d, wd) => {
        if (!d.on) return;
        if (d.a1 && d.b1) rows.push({ staff_id: staffId, weekday: wd, start_min: labelToMin(d.a1), end_min: labelToMin(d.b1) });
        if (d.a2 && d.b2) rows.push({ staff_id: staffId, weekday: wd, start_min: labelToMin(d.a2), end_min: labelToMin(d.b2) });
      });
      const valid = rows.filter((r) => r.start_min < r.end_min);
      if (valid.length) await supabase.from("staff_schedules").insert(valid);

      // 対応可能メニューを保存（作り直し）
      await supabase.from("staff_services").delete().eq("staff_id", staffId);
      const linkRows = [...menuIds].map((service_id) => ({ staff_id: staffId, service_id }));
      if (linkRows.length) await supabase.from("staff_services").insert(linkRows);

      setEditing(null);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "エラー");
    } finally {
      setBusy(false);
    }
  }

  // 並び替え（上下）
  async function move(idx: number, dir: -1 | 1) {
    const j = idx + dir;
    if (j < 0 || j >= staff.length) return;
    const a = staff[idx], b = staff[j];
    await Promise.all([
      supabase.from("staff").update({ sort_order: b.sort_order }).eq("id", a.id),
      supabase.from("staff").update({ sort_order: a.sort_order }).eq("id", b.id),
    ]);
    reload();
  }

  if (loading) return <p className="py-8 text-center text-sm text-slate-500">読み込み中…</p>;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <h1 className="text-lg font-bold text-slate-800">スタッフ管理</h1>
        <button
          onClick={() => openEdit("new")}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white"
        >
          ＋ スタッフ追加
        </button>
      </div>
      <p className="mb-3 text-xs text-slate-500">
        追加すると予約表に列が自動で増えます。退職・休止は「非表示」にでき、過去の予約は残ります。
      </p>

      <div className="space-y-2">
        {staff.map((s, i) => {
          const nMenus = links.filter((l) => l.staff_id === s.id).length;
          return (
            <div key={s.id} className="flex items-center gap-3 rounded-xl border bg-white p-3">
              <div className="flex flex-col">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="text-slate-400 disabled:opacity-30">▲</button>
                <button onClick={() => move(i, 1)} disabled={i === staff.length - 1} className="text-slate-400 disabled:opacity-30">▼</button>
              </div>
              {s.image_path ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={s.image_path} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
              ) : (
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: s.color || "#94a3b8" }}
                >
                  {(s.display_name || s.name).slice(0, 1)}
                </span>
              )}
              <div className="min-w-0 flex-1">
                <div className="font-bold text-slate-800">
                  {s.display_name || s.name}
                  <span className="ml-2 text-xs font-normal text-slate-400">{s.name_kana}</span>
                </div>
                <div className="mt-0.5 flex flex-wrap gap-1 text-[10px]">
                  <span className={`rounded px-1.5 py-0.5 ${s.status === "active" ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-500"}`}>
                    {STATUS_LABELS[s.status]}
                  </span>
                  {!s.bookable && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-amber-700">受付停止</span>}
                  {!s.patient_visible && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">患者非表示</span>}
                  {!s.admin_visible && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">管理非表示</span>}
                  <span className="rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">対応{nMenus}件</span>
                </div>
              </div>
              <button onClick={() => openEdit(s)} className="shrink-0 text-sm text-blue-600">編集</button>
            </div>
          );
        })}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center sm:p-4">
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-white p-4 sm:rounded-2xl">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-bold text-slate-800">{editing === "new" ? "スタッフ追加" : "スタッフ編集"}</h2>
              <button onClick={() => setEditing(null)} className="text-slate-400">✕</button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Lbl t="スタッフ名 *"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="fld" /></Lbl>
              <Lbl t="フリガナ"><input value={f.name_kana} onChange={(e) => setF({ ...f, name_kana: e.target.value })} className="fld" /></Lbl>
              <Lbl t="表示名（患者向け）"><input value={f.display_name} onChange={(e) => setF({ ...f, display_name: e.target.value })} placeholder={f.name} className="fld" /></Lbl>
              <Lbl t="役職"><input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} className="fld" /></Lbl>
              <Lbl t="所属院"><input value={f.clinic} onChange={(e) => setF({ ...f, clinic: e.target.value })} className="fld" /></Lbl>
              <Lbl t="在籍状態">
                <select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as StaffStatus })} className="fld">
                  {(["active", "paused", "retired", "hidden"] as StaffStatus[]).map((v) => (
                    <option key={v} value={v}>{STATUS_LABELS[v]}</option>
                  ))}
                </select>
              </Lbl>
            </div>

            {/* 担当カラー */}
            <div className="mt-3">
              <span className="mb-1 block text-xs font-medium text-slate-600">担当カラー（グレー不可）</span>
              <div className="mb-2 flex flex-wrap gap-1.5">
                {PALETTE.map((c) => (
                  <button key={c} onClick={() => setF({ ...f, color: c })}
                    className={`h-7 w-7 rounded-full ${f.color === c ? "ring-2 ring-offset-2 ring-slate-800" : ""}`}
                    style={{ backgroundColor: c }} />
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input type="color" value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className="h-8 w-10 rounded border" />
                <input value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} className="fld w-28" />
                {isGrayish(f.color) && <span className="text-xs font-bold text-red-600">⚠ グレーは使用できません</span>}
              </div>
            </div>

            {/* 表示・受付 */}
            <div className="mt-3 flex flex-wrap gap-3 text-sm">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.bookable} onChange={(e) => setF({ ...f, bookable: e.target.checked })} />予約受付</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.patient_visible} onChange={(e) => setF({ ...f, patient_visible: e.target.checked })} />患者画面に表示</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={f.admin_visible} onChange={(e) => setF({ ...f, admin_visible: e.target.checked })} />管理画面に表示</label>
            </div>

            {/* 勤務時間 */}
            <div className="mt-4">
              <span className="mb-1 block text-xs font-bold text-slate-600">勤務時間（曜日ごと・最大2枠）</span>
              <div className="space-y-1">
                {days.map((d, wd) => (
                  <div key={wd} className="flex items-center gap-2 text-xs">
                    <label className="flex w-14 items-center gap-1">
                      <input type="checkbox" checked={d.on} onChange={(e) => setDays(days.map((x, i) => i === wd ? { ...x, on: e.target.checked } : x))} />
                      {WEEKDAY_LABELS[wd]}
                    </label>
                    {d.on ? (
                      <div className="flex flex-wrap items-center gap-1">
                        <input type="time" step={300} value={d.a1} onChange={(e) => setDays(days.map((x, i) => i === wd ? { ...x, a1: e.target.value } : x))} className="rounded border px-1 py-0.5" />
                        <span>-</span>
                        <input type="time" step={300} value={d.b1} onChange={(e) => setDays(days.map((x, i) => i === wd ? { ...x, b1: e.target.value } : x))} className="rounded border px-1 py-0.5" />
                        <span className="mx-1 text-slate-300">/</span>
                        <input type="time" step={300} value={d.a2} onChange={(e) => setDays(days.map((x, i) => i === wd ? { ...x, a2: e.target.value } : x))} className="rounded border px-1 py-0.5" />
                        <span>-</span>
                        <input type="time" step={300} value={d.b2} onChange={(e) => setDays(days.map((x, i) => i === wd ? { ...x, b2: e.target.value } : x))} className="rounded border px-1 py-0.5" />
                      </div>
                    ) : (
                      <span className="text-slate-400">休み</span>
                    )}
                  </div>
                ))}
              </div>
              <p className="mt-1 text-[10px] text-slate-400">2枠目が不要な日は右側を空にしてください。個別の例外は「休日・休診登録」で上書きできます。</p>
            </div>

            {/* 対応可能メニュー */}
            <div className="mt-4">
              <span className="mb-1 block text-xs font-bold text-slate-600">対応可能メニュー</span>
              <div className="flex flex-wrap gap-1.5">
                {services.map((s) => (
                  <button key={s.id} onClick={() => toggleMenu(s.id)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${menuIds.has(s.id) ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-600"}`}>
                    {s.name}
                  </button>
                ))}
              </div>
            </div>

            {/* 患者向け 紹介文・顔写真 */}
            <label className="mt-3 block">
              <span className="mb-1 block text-xs font-medium text-slate-600">紹介文（患者画面に表示）</span>
              <textarea
                value={f.bio}
                onChange={(e) => setF({ ...f, bio: e.target.value })}
                rows={3}
                placeholder="例：柔道整復師。スポーツ外傷から慢性的な不調まで幅広く対応します。"
                className="fld w-full"
              />
            </label>
            <div className="mt-3">
              <span className="mb-1 block text-xs font-medium text-slate-600">顔写真（患者画面に表示）</span>
              <div className="flex items-center gap-3">
                {f.image_path ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.image_path} alt="" className="h-16 w-16 shrink-0 rounded-full object-cover" />
                ) : (
                  <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs text-slate-400">
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
                        if (file) uploadPhoto(file);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {f.image_path && (
                    <button
                      type="button"
                      onClick={() => setF({ ...f, image_path: "" })}
                      className="text-xs text-slate-400"
                    >
                      写真を削除
                    </button>
                  )}
                </div>
              </div>
              <input
                value={f.image_path}
                onChange={(e) => setF({ ...f, image_path: e.target.value })}
                placeholder="またはURLを直接入力"
                className="fld mt-2 w-full"
              />
            </div>

            {editing !== "new" && (
              <label className="mt-3 block">
                <span className="mb-1 block text-xs font-medium text-slate-600">備考</span>
                <input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} className="fld w-full" />
              </label>
            )}

            {error && <p className="mt-3 rounded bg-red-50 px-2 py-1.5 text-sm text-red-600">{error}</p>}

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setEditing(null)} className="rounded-lg border px-4 py-2 text-sm text-slate-600">閉じる</button>
              <button onClick={save} disabled={busy} className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white disabled:bg-slate-300">
                {busy ? "保存中…" : "保存"}
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .fld {
          border: 1px solid #cbd5e1;
          border-radius: 8px;
          padding: 6px 8px;
          font-size: 13px;
          width: 100%;
        }
      `}</style>
    </div>
  );
}

function Lbl({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-slate-600">{t}</span>
      {children}
    </label>
  );
}
