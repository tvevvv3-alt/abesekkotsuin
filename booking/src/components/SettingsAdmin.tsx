"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadSettings } from "@/lib/data";
import type { Settings } from "@/lib/types";
import { labelToMin, minToLabel } from "@/lib/booking";

export default function SettingsAdmin() {
  const supabase = useMemo(() => createClient(), []);
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);

  const reload = useCallback(async () => {
    setS(await loadSettings(supabase));
  }, [supabase]);

  useEffect(() => {
    reload();
  }, [reload]);

  async function save() {
    if (!s) return;
    setBusy(true);
    setSaved(false);
    await supabase.from("settings").upsert({
      id: 1,
      slot_unit: s.slot_unit,
      same_day_ok: s.same_day_ok,
      last_accept_min: s.last_accept_min,
      cancel_deadline_hours: s.cancel_deadline_hours,
      change_deadline_hours: s.change_deadline_hours,
      autofill: s.autofill,
      recheck_on_book: true,
      updated_at: new Date().toISOString(),
    });
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  if (!s) return <p className="py-8 text-center text-sm text-slate-500">読み込み中…</p>;
  const up = (patch: Partial<Settings>) => setS({ ...s, ...patch });

  return (
    <div className="max-w-lg">
      <h1 className="mb-3 text-lg font-bold text-slate-800">基本設定</h1>
      <div className="space-y-4 rounded-xl border bg-white p-4">
        <Row label="予約開始時刻の単位">
          <div className="flex gap-2">
            {[15, 30].map((u) => (
              <button
                key={u}
                onClick={() => up({ slot_unit: u })}
                className={`rounded-lg border px-4 py-1.5 text-sm font-bold ${
                  s.slot_unit === u ? "border-blue-600 bg-blue-600 text-white" : "border-slate-300 text-slate-600"
                }`}
              >
                {u}分
              </button>
            ))}
            <span className="self-center text-xs text-slate-400">（内部判定は常に5分単位）</span>
          </div>
        </Row>

        <Row label="当日予約">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.same_day_ok} onChange={(e) => up({ same_day_ok: e.target.checked })} />
            当日の予約を受け付ける
          </label>
        </Row>

        <Row label="患者が予約できる最終時刻">
          <div className="flex items-center gap-2">
            <input
              type="time"
              step={300}
              value={s.last_accept_min != null ? minToLabel(s.last_accept_min) : ""}
              onChange={(e) =>
                up({ last_accept_min: e.target.value ? labelToMin(e.target.value) : null })
              }
              className="rounded-md border px-2 py-1.5 text-sm"
            />
            <button onClick={() => up({ last_accept_min: null })} className="text-xs text-slate-500">
              クリア（営業終了まで）
            </button>
          </div>
        </Row>

        <Row label="キャンセル受付期限">
          <div className="flex items-center gap-1 text-sm">
            <input
              type="number"
              min={0}
              value={s.cancel_deadline_hours}
              onChange={(e) => up({ cancel_deadline_hours: parseInt(e.target.value || "0", 10) })}
              className="w-20 rounded-md border px-2 py-1.5"
            />
            時間前まで
          </div>
        </Row>

        <Row label="予約変更受付期限">
          <div className="flex items-center gap-1 text-sm">
            <input
              type="number"
              min={0}
              value={s.change_deadline_hours}
              onChange={(e) => up({ change_deadline_hours: parseInt(e.target.value || "0", 10) })}
              className="w-20 rounded-md border px-2 py-1.5"
            />
            時間前まで
          </div>
        </Row>

        <Row label="患者情報の自動入力">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={s.autofill} onChange={(e) => up({ autofill: e.target.checked })} />
            2回目以降、端末に保存した情報を自動入力する
          </label>
        </Row>

        <Row label="予約確定時の空き再確認">
          <span className="text-sm text-slate-500">常に有効（二重予約防止のため変更不可）</span>
        </Row>

        <div className="flex items-center gap-3 pt-2">
          <button
            onClick={save}
            disabled={busy}
            className="rounded-lg bg-blue-600 px-6 py-2 text-sm font-bold text-white disabled:bg-slate-300"
          >
            {busy ? "保存中…" : "保存"}
          </button>
          {saved && <span className="text-sm font-medium text-green-600">保存しました ✓</span>}
        </div>
      </div>

      <p className="mt-3 text-xs text-slate-400">
        ※ 営業時間（曜日ごと）はスタッフ管理の勤務時間から算出しています。個別の休みは「休日・休診登録」で設定します。
      </p>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1 text-sm font-bold text-slate-700">{label}</div>
      {children}
    </div>
  );
}
