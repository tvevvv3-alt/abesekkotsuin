"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadSettings } from "@/lib/data";
import type { ClinicBranding, Settings } from "@/lib/types";
import { labelToMin, minToLabel } from "@/lib/booking";

export default function SettingsAdmin() {
  const supabase = useMemo(() => createClient(), []);
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      logo_url: s.logo_url,
      clinics: s.clinics,
      updated_at: new Date().toISOString(),
    });
    setBusy(false);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  // 画像を staff-photos バケットへアップロードして公開URLを返す（失敗時 null）
  async function uploadImage(file: File): Promise<string | null> {
    setUploading(true);
    setError(null);
    const ext = (file.name.split(".").pop() || "png").toLowerCase();
    const path = `logo-${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from("staff-photos")
      .upload(path, file, { upsert: true, cacheControl: "3600", contentType: file.type });
    setUploading(false);
    if (upErr) {
      setError(
        `画像のアップロードに失敗しました：${upErr.message}（バケット "staff-photos" 作成のSQLを実行済みか確認してください）`
      );
      return null;
    }
    return supabase.storage.from("staff-photos").getPublicUrl(path).data.publicUrl;
  }

  async function uploadLogo(file: File) {
    const url = await uploadImage(file);
    if (url) setS((prev) => (prev ? { ...prev, logo_url: url } : prev));
  }

  if (!s) return <p className="py-8 text-center text-sm text-slate-500">読み込み中…</p>;
  const up = (patch: Partial<Settings>) => setS({ ...s, ...patch });

  // 院ごとの表示（未設定は既定値）
  const CLINIC_DEFAULTS: Record<"ibaraki" | "kawanishi", { name: string; sub: string }> = {
    ibaraki: { name: "茨木本院", sub: "接骨・鍼灸・全身通電・体幹教室" },
    kawanishi: { name: "川西整体院", sub: "整体（施術50分）" },
  };
  const clinicVal = (id: "ibaraki" | "kawanishi"): ClinicBranding => {
    const c = s.clinics?.[id];
    return {
      name: c?.name ?? CLINIC_DEFAULTS[id].name,
      sub: c?.sub ?? CLINIC_DEFAULTS[id].sub,
      logo_url: c?.logo_url ?? null,
    };
  };
  const updateClinic = (id: "ibaraki" | "kawanishi", patch: Partial<ClinicBranding>) => {
    const next = { ibaraki: clinicVal("ibaraki"), kawanishi: clinicVal("kawanishi") };
    next[id] = { ...next[id], ...patch };
    up({ clinics: next });
  };
  const uploadClinicLogo = async (id: "ibaraki" | "kawanishi", file: File) => {
    const url = await uploadImage(file);
    if (url) updateClinic(id, { logo_url: url });
  };

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

        <Row label="予約トップのロゴ画像">
          <div className="flex items-center gap-3">
            {s.logo_url ? (
              <img
                src={s.logo_url}
                alt="ロゴ"
                className="h-20 w-20 rounded-full border object-cover"
              />
            ) : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full border border-dashed text-[10px] text-slate-400">
                未設定
              </div>
            )}
            <div className="flex flex-col gap-1">
              <label className="cursor-pointer rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-bold text-slate-600 hover:bg-slate-50">
                {uploading ? "アップロード中…" : "ロゴをアップロード"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) uploadLogo(file);
                    e.target.value = "";
                  }}
                />
              </label>
              {s.logo_url && (
                <button
                  onClick={() => up({ logo_url: null })}
                  className="text-left text-xs text-slate-500 hover:text-red-500"
                >
                  削除（既定のロゴに戻す）
                </button>
              )}
            </div>
          </div>
          <p className="mt-1 text-xs text-slate-400">
            ※ アップロード後は「保存」を押すと反映されます。正方形の画像がきれいに表示されます。
          </p>
        </Row>

        <Row label="院の表示（名称・説明・ロゴ）">
          <div className="space-y-3">
            {(["ibaraki", "kawanishi"] as const).map((id) => {
              const c = clinicVal(id);
              return (
                <div key={id} className="rounded-lg border bg-slate-50 p-3">
                  <div className="mb-2 flex items-center gap-3">
                    {c.logo_url ? (
                      <img
                        src={c.logo_url}
                        alt={c.name}
                        className="h-14 w-14 rounded-full border object-cover"
                      />
                    ) : (
                      <div className="flex h-14 w-14 items-center justify-center rounded-full border border-dashed text-[10px] text-slate-400">
                        未設定
                      </div>
                    )}
                    <div className="flex flex-col gap-1">
                      <label className="cursor-pointer rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 hover:bg-slate-100">
                        {uploading ? "アップロード中…" : "ロゴをアップロード"}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={uploading}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadClinicLogo(id, file);
                            e.target.value = "";
                          }}
                        />
                      </label>
                      {c.logo_url && (
                        <button
                          onClick={() => updateClinic(id, { logo_url: null })}
                          className="text-left text-[11px] text-slate-500 hover:text-red-500"
                        >
                          ロゴを削除
                        </button>
                      )}
                    </div>
                  </div>
                  <label className="mb-1 block text-[11px] font-bold text-slate-500">院名</label>
                  <input
                    value={c.name}
                    onChange={(e) => updateClinic(id, { name: e.target.value })}
                    className="mb-2 w-full rounded-md border px-2 py-1.5 text-sm"
                    placeholder={CLINIC_DEFAULTS[id].name}
                  />
                  <label className="mb-1 block text-[11px] font-bold text-slate-500">説明（施術内容など）</label>
                  <input
                    value={c.sub}
                    onChange={(e) => updateClinic(id, { sub: e.target.value })}
                    className="w-full rounded-md border px-2 py-1.5 text-sm"
                    placeholder={CLINIC_DEFAULTS[id].sub}
                  />
                </div>
              );
            })}
          </div>
        </Row>

        {error && <p className="rounded-md bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

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
