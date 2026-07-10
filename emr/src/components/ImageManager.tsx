"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { IMAGE_TYPE_LABELS } from "@/lib/constants";
import type { PatientImage, ImageType, StaffRole } from "@/lib/types";

interface Row extends PatientImage {
  url?: string;
}

export default function ImageManager({
  patientId,
  role,
}: {
  patientId: string;
  role: StaffRole;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [kind, setKind] = useState<ImageType>("echo");
  const canUpload = role === "director" || role === "therapist";
  const canDelete = role === "director";

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("images")
      .select("*")
      .eq("patient_id", patientId)
      .order("taken_on", { ascending: false })
      .order("created_at", { ascending: false });

    const list = (data as PatientImage[]) ?? [];
    const withUrls: Row[] = await Promise.all(
      list.map(async (img) => {
        const { data: signed } = await supabase.storage
          .from("patient-images")
          .createSignedUrl(img.storage_path, 60 * 60);
        return { ...img, url: signed?.signedUrl };
      })
    );
    setRows(withUrls);
    setLoading(false);
  }, [patientId]);

  useEffect(() => {
    load();
  }, [load]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    setUploading(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    for (const file of Array.from(files)) {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${patientId}/${Date.now()}-${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("patient-images")
        .upload(path, file, { contentType: file.type });
      if (upErr) {
        alert("アップロード失敗: " + upErr.message);
        continue;
      }
      await supabase.from("images").insert({
        patient_id: patientId,
        image_type: kind,
        storage_path: path,
        uploaded_by: user?.id,
      });
    }
    setUploading(false);
    e.target.value = "";
    load();
  }

  async function remove(img: Row) {
    if (!confirm("この画像を削除しますか？")) return;
    const supabase = createClient();
    await supabase.storage.from("patient-images").remove([img.storage_path]);
    await supabase.from("images").delete().eq("id", img.id);
    load();
  }

  return (
    <section className="space-y-3">
      {canUpload && (
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="field w-auto py-2"
            value={kind}
            onChange={(e) => setKind(e.target.value as ImageType)}
          >
            <option value="echo">エコー画像</option>
            <option value="photo">患部写真</option>
          </select>
          <label className="btn-primary cursor-pointer text-sm">
            {uploading ? "アップロード中…" : "＋画像を追加"}
            <input
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={onFile}
              disabled={uploading}
            />
          </label>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">読み込み中…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400">画像はまだありません</p>
      ) : (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {rows.map((img) => (
            <figure key={img.id} className="overflow-hidden rounded-xl border border-gray-100 bg-white">
              {img.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={img.url}
                  alt={img.caption ?? ""}
                  className="aspect-square w-full object-cover"
                />
              ) : (
                <div className="aspect-square w-full bg-gray-100" />
              )}
              <figcaption className="flex items-center justify-between px-2 py-1.5 text-xs text-gray-500">
                <span>
                  {IMAGE_TYPE_LABELS[img.image_type]} · {img.taken_on}
                </span>
                {canDelete && (
                  <button
                    onClick={() => remove(img)}
                    className="text-red-500 hover:underline"
                  >
                    削除
                  </button>
                )}
              </figcaption>
            </figure>
          ))}
        </div>
      )}
    </section>
  );
}
