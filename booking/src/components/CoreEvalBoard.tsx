"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import CoreEvalEditor from "@/components/CoreEvalEditor";
import { EVAL_CATS, type EvalKey } from "@/lib/eval";

// 画像ファイル → PNG DataURL（幅を抑えて軽量化）
function fileToPng(file: File, maxW = 420): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxW / img.width);
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { URL.revokeObjectURL(url); reject(new Error("no ctx")); return; }
      ctx.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("load failed")); };
    img.src = url;
  });
}

export default function CoreEvalBoard() {
  const supabase = useMemo(() => createClient(), []);
  const [names, setNames] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [images, setImages] = useState<Partial<Record<EvalKey, string>>>({});
  const [imgOpen, setImgOpen] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: cm }, { data: ev }, { data: st }] = await Promise.all([
        supabase.from("class_members").select("name"),
        supabase.from("core_evaluations").select("name"),
        supabase.from("settings").select("eval_images").eq("id", 1).maybeSingle(),
      ]);
      const set = new Set<string>();
      (cm ?? []).forEach((x: { name: string }) => x.name && set.add(x.name));
      (ev ?? []).forEach((x: { name: string }) => x.name && set.add(x.name));
      setNames(Array.from(set).sort((a, b) => a.localeCompare(b, "ja")));
      const im = (st as { eval_images?: Partial<Record<EvalKey, string>> } | null)?.eval_images;
      if (im) setImages(im);
    })();
  }, [supabase]);

  async function uploadIllust(key: EvalKey, file: File) {
    setBusyKey(key);
    try {
      const png = await fileToPng(file);
      const res = await fetch("/api/eval/illust", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, pngBase64: png }),
      });
      const j = (await res.json()) as { ok: boolean; images?: Partial<Record<EvalKey, string>>; error?: string };
      if (j.ok && j.images) setImages(j.images);
      else alert("アップロードに失敗しました：" + (j.error || "?"));
    } catch (e) {
      alert("画像の処理に失敗：" + (e instanceof Error ? e.message : "?"));
    }
    setBusyKey(null);
  }

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800">体幹評価</h1>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">3ヶ月に1回</span>
        <span className="text-[11px] text-slate-400">
          ※ LINEに送るときは、予約ボードやカレンダーの「体幹テスト」から開くと送信先が確実です。
        </span>
      </div>

      {/* イラスト設定 */}
      <div className="mb-4 rounded-xl border bg-white">
        <button onClick={() => setImgOpen((o) => !o)} className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-bold text-slate-700">
          <span>項目イラスト設定（レポート画像に表示）</span>
          <span className="text-slate-400">{imgOpen ? "▲ 閉じる" : "▼ 開く"}</span>
        </button>
        {imgOpen && (
          <div className="grid grid-cols-2 gap-2 border-t p-3 sm:grid-cols-5">
            {EVAL_CATS.map((c) => (
              <div key={c.key} className="rounded-lg border p-2 text-center">
                <div className="mb-1 text-[11px] font-bold" style={{ color: c.color }}>{c.label}</div>
                <div className="mb-1 flex h-16 items-center justify-center overflow-hidden rounded bg-slate-50">
                  {images[c.key] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={images[c.key]} alt={c.label} className="max-h-16 object-contain" />
                  ) : (
                    <span className="text-[10px] text-slate-300">未設定</span>
                  )}
                </div>
                <label className="block cursor-pointer rounded bg-slate-100 py-1 text-[11px] font-bold text-slate-600 active:bg-slate-200">
                  {busyKey === c.key ? "アップ中…" : "画像を選ぶ"}
                  <input type="file" accept="image/*" className="hidden"
                    onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadIllust(c.key, f); e.target.value = ""; }} />
                </label>
              </div>
            ))}
          </div>
        )}
      </div>

      <CoreEvalEditor name={name} editableName names={names} onNameChange={setName} />
    </div>
  );
}
