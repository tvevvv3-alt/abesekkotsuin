"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Patient, Staff } from "@/lib/types";

type Values = Partial<Patient>;

const FIELDS: {
  key: keyof Patient;
  label: string;
  type?: string;
  span2?: boolean;
}[] = [
  { key: "name", label: "氏名" },
  { key: "name_kana", label: "フリガナ" },
  { key: "birth_date", label: "生年月日", type: "date" },
  { key: "phone", label: "電話番号", type: "tel" },
  { key: "address", label: "住所", span2: true },
  { key: "school", label: "学校" },
  { key: "team", label: "所属チーム" },
  { key: "sport", label: "競技" },
  { key: "position", label: "ポジション" },
  { key: "guardian_name", label: "保護者氏名" },
  { key: "guardian_contact", label: "保護者連絡先", type: "tel" },
  { key: "first_visit_date", label: "初回来院日", type: "date" },
];

export default function PatientForm({
  staffList,
  initial,
}: {
  staffList: Staff[];
  initial?: Patient;
}) {
  const router = useRouter();
  const [values, setValues] = useState<Values>(
    initial ?? {
      patient_number: "",
      sex: undefined,
      assigned_staff_id: null,
      first_visit_date: new Date().toISOString().slice(0, 10),
    }
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function set<K extends keyof Patient>(key: K, v: Patient[K] | null) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const supabase = createClient();

    // 患者ID未入力なら自動採番（P + 年月日時分秒）
    const payload = {
      ...values,
      patient_number:
        values.patient_number?.trim() ||
        "P" + new Date().toISOString().replace(/\D/g, "").slice(0, 14),
    };

    if (initial) {
      const { error } = await supabase
        .from("patients")
        .update(payload)
        .eq("id", initial.id);
      if (error) return fail(error.message);
      router.replace(`/patients/${initial.id}`);
    } else {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const { data, error } = await supabase
        .from("patients")
        .insert({ ...payload, created_by: user?.id })
        .select("id")
        .single();
      if (error) return fail(error.message);
      router.replace(`/patients/${data!.id}`);
    }
    router.refresh();

    function fail(msg: string) {
      setError(msg.includes("duplicate") ? "その患者IDは既に使われています" : msg);
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5">
      <div className="card space-y-4">
        <div>
          <label className="label">患者ID（空欄で自動採番）</label>
          <input
            className="field"
            value={values.patient_number ?? ""}
            onChange={(e) => set("patient_number", e.target.value)}
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {FIELDS.slice(0, 2).map((f) => (
            <Field key={f.key} f={f} values={values} set={set} />
          ))}
          <div>
            <label className="label">性別</label>
            <select
              className="field"
              value={values.sex ?? ""}
              onChange={(e) =>
                set("sex", (e.target.value || null) as Patient["sex"])
              }
            >
              <option value="">未選択</option>
              <option value="male">男性</option>
              <option value="female">女性</option>
              <option value="other">その他</option>
            </select>
          </div>
          {FIELDS.slice(2).map((f) => (
            <div key={f.key} className={f.span2 ? "sm:col-span-2" : ""}>
              <Field f={f} values={values} set={set} />
            </div>
          ))}
          <div>
            <label className="label">担当スタッフ</label>
            <select
              className="field"
              value={values.assigned_staff_id ?? ""}
              onChange={(e) =>
                set("assigned_staff_id", e.target.value || null)
              }
            >
              <option value="">未割当</option>
              {staffList.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="card grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className="label">既往歴</label>
          <textarea
            className="field min-h-20"
            value={values.medical_history ?? ""}
            onChange={(e) => set("medical_history", e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">アレルギー</label>
          <textarea
            className="field min-h-20"
            value={values.allergies ?? ""}
            onChange={(e) => set("allergies", e.target.value)}
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={() => router.back()}
          className="btn-ghost flex-1"
        >
          キャンセル
        </button>
        <button type="submit" className="btn-primary flex-1" disabled={saving}>
          {saving ? "保存中…" : "保存"}
        </button>
      </div>
    </form>
  );
}

function Field({
  f,
  values,
  set,
}: {
  f: { key: keyof Patient; label: string; type?: string };
  values: Values;
  set: <K extends keyof Patient>(key: K, v: Patient[K] | null) => void;
}) {
  return (
    <div>
      <label className="label">{f.label}</label>
      <input
        type={f.type ?? "text"}
        className="field"
        value={(values[f.key] as string) ?? ""}
        onChange={(e) =>
          set(f.key, e.target.value as Patient[typeof f.key])
        }
      />
    </div>
  );
}
