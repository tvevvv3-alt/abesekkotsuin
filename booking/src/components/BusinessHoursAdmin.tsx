"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadBusinessHours, loadStaff } from "@/lib/data";
import { WEEKDAY_LABELS, labelToMin, minToLabel } from "@/lib/booking";
import type { Staff } from "@/lib/types";

// フォーム上の1曜日ぶん（時刻は "HH:MM" 文字列で保持）
type DayForm = {
  is_open: boolean;
  a1: string; // 午前 開始
  b1: string; // 午前 終了
  a2: string; // 午後 開始
  b2: string; // 午後 終了
};

const toLabel = (m: number | null) => (m != null ? minToLabel(m) : "");
const toMin = (s: string) => (s ? labelToMin(s) : null);

export default function BusinessHoursAdmin() {
  const supabase = useMemo(() => createClient(), []);
  const [days, setDays] = useState<DayForm[] | null>(null);
  const [staff, setStaff] = useState<Staff[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const reload = useCallback(async () => {
    const [bh, st] = await Promise.all([
      loadBusinessHours(supabase),
      loadStaff(supabase, false), // 在籍中スタッフ（受付ON/OFF問わず）
    ]);
    const form: DayForm[] = bh.map((d) => ({
      is_open: d.is_open,
      a1: toLabel(d.seg1_start),
      b1: toLabel(d.seg1_end),
      a2: toLabel(d.seg2_start),
      b2: toLabel(d.seg2_end),
    }));
    setDays(form);
    setStaff(st);
    // 予約受付ONのスタッフを初期選択
    setSelected(new Set(st.filter((s) => s.bookable).map((s) => s.id)));
  }, [supabase]);

  useEffect(() => {
    reload();
  }, [reload]);

  const setDay = (wd: number, patch: Partial<DayForm>) =>
    setDays((prev) => (prev ? prev.map((d, i) => (i === wd ? { ...d, ...patch } : d)) : prev));

  const toggleStaff = (id: string) =>
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  // 営業時間テーブルへ保存
  async function saveHours(): Promise<boolean> {
    if (!days) return false;
    const rows = days.map((d, wd) => ({
      weekday: wd,
      is_open: d.is_open,
      seg1_start: d.is_open ? toMin(d.a1) : null,
      seg1_end: d.is_open ? toMin(d.b1) : null,
      seg2_start: d.is_open ? toMin(d.a2) : null,
      seg2_end: d.is_open ? toMin(d.b2) : null,
    }));
    const { error } = await supabase.from("business_hours").upsert(rows, { onConflict: "weekday" });
    if (error) {
      setMsg(`保存に失敗しました：${error.message}`);
      return false;
    }
    return true;
  }

  async function onSaveOnly() {
    setBusy(true);
    setMsg(null);
    const ok = await saveHours();
    setBusy(false);
    if (ok) {
      setMsg("営業時間を保存しました ✓");
      setTimeout(() => setMsg(null), 2500);
    }
  }

  // 営業時間 → 選択スタッフの勤務時間へ一括反映
  async function onApply() {
    if (!days) return;
    const targets = staff.filter((s) => selected.has(s.id));
    if (targets.length === 0) {
      setMsg("反映するスタッフを1人以上選んでください。");
      return;
    }
    const names = targets.map((s) => s.name).join("・");
    if (
      !window.confirm(
        `この営業時間を次のスタッフの勤務時間に一括反映します。\n\n【対象】${names}\n\n対象スタッフの現在の勤務時間は上書きされます。よろしいですか？`
      )
    )
      return;

    setBusy(true);
    setMsg(null);
    // まず営業時間を保存
    if (!(await saveHours())) {
      setBusy(false);
      return;
    }
    // 各スタッフの勤務時間を作り直す
    for (const s of targets) {
      const { error: delErr } = await supabase.from("staff_schedules").delete().eq("staff_id", s.id);
      if (delErr) {
        setMsg(`反映に失敗しました（${s.name}）：${delErr.message}`);
        setBusy(false);
        return;
      }
      const rows: { staff_id: string; weekday: number; start_min: number; end_min: number }[] = [];
      days.forEach((d, wd) => {
        if (!d.is_open) return;
        const seg1s = toMin(d.a1);
        const seg1e = toMin(d.b1);
        const seg2s = toMin(d.a2);
        const seg2e = toMin(d.b2);
        if (seg1s != null && seg1e != null && seg1s < seg1e)
          rows.push({ staff_id: s.id, weekday: wd, start_min: seg1s, end_min: seg1e });
        if (seg2s != null && seg2e != null && seg2s < seg2e)
          rows.push({ staff_id: s.id, weekday: wd, start_min: seg2s, end_min: seg2e });
      });
      if (rows.length) {
        const { error: insErr } = await supabase.from("staff_schedules").insert(rows);
        if (insErr) {
          setMsg(`反映に失敗しました（${s.name}）：${insErr.message}`);
          setBusy(false);
          return;
        }
      }
    }
    setBusy(false);
    setMsg(`${targets.length}名のスタッフに反映しました ✓（患者カレンダーにも即反映されます）`);
    setTimeout(() => setMsg(null), 4000);
  }

  if (!days) return <p className="py-8 text-center text-sm text-slate-500">読み込み中…</p>;

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-lg font-bold text-slate-800">営業時間</h1>
      <p className="mb-3 text-xs text-slate-500">
        医院の基本の営業時間です。ここを変更して「一括反映」すると、選んだスタッフの勤務時間がまとめて切り替わり、患者予約カレンダーにも反映されます。
      </p>

      {/* 曜日ごとの営業時間 */}
      <div className="space-y-1 rounded-xl border bg-white p-4">
        <div className="mb-1 text-sm font-bold text-slate-700">曜日ごとの営業時間（午前 / 午後の2枠）</div>
        {days.map((d, wd) => (
          <div key={wd} className="flex flex-wrap items-center gap-2 border-b border-slate-100 py-1.5 text-sm last:border-0">
            <label className="flex w-16 items-center gap-1.5 font-medium">
              <input
                type="checkbox"
                checked={d.is_open}
                onChange={(e) => setDay(wd, { is_open: e.target.checked })}
              />
              {WEEKDAY_LABELS[wd]}曜
            </label>
            {d.is_open ? (
              <div className="flex flex-wrap items-center gap-1">
                <input type="time" step={300} value={d.a1} onChange={(e) => setDay(wd, { a1: e.target.value })} className="rounded border px-1.5 py-1" />
                <span>-</span>
                <input type="time" step={300} value={d.b1} onChange={(e) => setDay(wd, { b1: e.target.value })} className="rounded border px-1.5 py-1" />
                <span className="mx-1 text-slate-300">/</span>
                <input type="time" step={300} value={d.a2} onChange={(e) => setDay(wd, { a2: e.target.value })} className="rounded border px-1.5 py-1" />
                <span>-</span>
                <input type="time" step={300} value={d.b2} onChange={(e) => setDay(wd, { b2: e.target.value })} className="rounded border px-1.5 py-1" />
              </div>
            ) : (
              <span className="text-slate-400">休み</span>
            )}
          </div>
        ))}
        <p className="pt-1 text-[10px] text-slate-400">午後枠が不要な日は右側の2枠を空にしてください。</p>
      </div>

      {/* 反映先スタッフ */}
      <div className="mt-4 rounded-xl border bg-white p-4">
        <div className="mb-2 text-sm font-bold text-slate-700">一括反映するスタッフ</div>
        <div className="flex flex-wrap gap-1.5">
          {staff.map((s) => (
            <button
              key={s.id}
              onClick={() => toggleStaff(s.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                selected.has(s.id) ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-600"
              }`}
            >
              {s.name}
            </button>
          ))}
          {staff.length === 0 && <span className="text-xs text-slate-400">在籍中のスタッフがいません</span>}
        </div>
        <p className="mt-2 text-[10px] text-slate-400">
          チェックしたスタッフだけ上書きされます。人によって時間が違う場合はチェックを外して、そのスタッフの勤務時間は「スタッフ管理」で個別に設定してください。
        </p>
      </div>

      {/* 操作 */}
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          onClick={onApply}
          disabled={busy}
          className="rounded-lg bg-blue-600 px-5 py-2 text-sm font-bold text-white disabled:bg-slate-300"
        >
          {busy ? "処理中…" : "選択スタッフに一括反映"}
        </button>
        <button
          onClick={onSaveOnly}
          disabled={busy}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-600 disabled:opacity-50"
        >
          営業時間だけ保存
        </button>
        {msg && <span className="text-sm font-medium text-green-600">{msg}</span>}
      </div>
    </div>
  );
}
