"use client";

import {
  MODALITIES,
  OTHER_MODALITY,
  MODALITY_MAP,
} from "@/lib/constants";
import type { TreatmentItem } from "@/lib/types";

// 機器チップ（複数選択）＋ 選択した機器ごとの詳細入力
export default function TreatmentInput({
  items,
  onChange,
}: {
  items: TreatmentItem[];
  onChange: (next: TreatmentItem[]) => void;
}) {
  const chips = [...MODALITIES.map((m) => m.name), OTHER_MODALITY];
  const isSelected = (name: string) =>
    items.some((it) => it.modality === name);

  function toggle(name: string) {
    if (isSelected(name)) {
      onChange(items.filter((it) => it.modality !== name));
    } else {
      onChange([...items, { modality: name }]);
    }
  }

  function update(index: number, patch: Partial<TreatmentItem>) {
    onChange(items.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  }

  return (
    <div className="space-y-4">
      {/* 機器チップ */}
      <div className="flex flex-wrap gap-1.5">
        {chips.map((name) => {
          const active = isSelected(name);
          return (
            <button
              key={name}
              type="button"
              onClick={() => toggle(name)}
              className={`rounded-full border px-3 py-1.5 text-xs font-medium transition active:scale-95 ${
                active
                  ? "border-brand bg-brand text-white shadow-sm"
                  : "border-gray-200 bg-white text-gray-700"
              }`}
            >
              {name}
            </button>
          );
        })}
      </div>

      {/* 選択機器ごとの詳細欄 */}
      {items.length > 0 && (
        <div className="space-y-3">
          {items.map((it, i) => {
            const def = MODALITY_MAP[it.modality];
            const isOther = it.modality === OTHER_MODALITY;
            const fields = def?.fields ?? [
              { key: "content" as const, label: "内容", area: true },
            ];
            return (
              <div
                key={`${it.modality}-${i}`}
                className="space-y-3 rounded-xl border border-gray-100 bg-gray-50/60 p-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-brand">
                    {isOther ? "その他" : it.modality}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggle(it.modality)}
                    className="text-xs text-gray-400"
                  >
                    解除
                  </button>
                </div>

                {isOther && (
                  <input
                    className="field bg-white"
                    placeholder="名称（例: 鍼、カッピング など）"
                    value={it.label ?? ""}
                    onChange={(e) => update(i, { label: e.target.value })}
                  />
                )}

                {fields.map((f) =>
                  f.area ? (
                    <div key={f.key}>
                      <label className="label">{f.label}</label>
                      <textarea
                        className="field min-h-16 bg-white"
                        value={(it[f.key] as string) ?? ""}
                        onChange={(e) =>
                          update(i, { [f.key]: e.target.value })
                        }
                      />
                    </div>
                  ) : (
                    <div key={f.key}>
                      <label className="label">{f.label}</label>
                      <input
                        className="field bg-white"
                        value={(it[f.key] as string) ?? ""}
                        onChange={(e) =>
                          update(i, { [f.key]: e.target.value })
                        }
                      />
                    </div>
                  )
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
