"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABELS } from "@/lib/constants";
import type { Staff, StaffRole } from "@/lib/types";

export default function StaffAdmin() {
  const [staff, setStaff] = useState<Staff[]>([]);
  const [loading, setLoading] = useState(true);
  const [uid, setUid] = useState("");
  const [name, setName] = useState("");
  const [role, setRole] = useState<StaffRole>("therapist");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from("staff")
      .select("*")
      .order("created_at");
    setStaff((data as Staff[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const supabase = createClient();
    const { error } = await supabase
      .from("staff")
      .insert({ id: uid.trim(), name: name.trim(), role });
    if (error) {
      setError(error.message);
      return;
    }
    setUid("");
    setName("");
    load();
  }

  async function updateRole(id: string, r: StaffRole) {
    const supabase = createClient();
    await supabase.from("staff").update({ role: r }).eq("id", id);
    load();
  }

  async function toggleActive(s: Staff) {
    const supabase = createClient();
    await supabase.from("staff").update({ active: !s.active }).eq("id", s.id);
    load();
  }

  return (
    <div className="space-y-5">
      <div className="card space-y-3">
        <h2 className="text-sm font-bold text-gray-500">スタッフを追加</h2>
        <p className="text-xs text-gray-400">
          Supabase の Authentication でユーザーを作成し、その User UID を貼り付けてください。
        </p>
        <form onSubmit={add} className="space-y-3">
          <input
            className="field"
            placeholder="User UID（Supabase Authentication から取得）"
            value={uid}
            onChange={(e) => setUid(e.target.value)}
            required
          />
          <div className="flex gap-3">
            <input
              className="field flex-1"
              placeholder="氏名"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
            <select
              className="field w-32"
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRole)}
            >
              <option value="director">院長</option>
              <option value="therapist">施術者</option>
              <option value="receptionist">受付</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button type="submit" className="btn-primary w-full">
            追加
          </button>
        </form>
      </div>

      {loading ? (
        <p className="text-sm text-gray-400">読み込み中…</p>
      ) : (
        <ul className="space-y-2">
          {staff.map((s) => (
            <li
              key={s.id}
              className={`card flex items-center justify-between gap-3 ${
                s.active ? "" : "opacity-50"
              }`}
            >
              <div className="min-w-0">
                <div className="font-medium">{s.name}</div>
                <div className="truncate text-xs text-gray-400">{s.id}</div>
              </div>
              <div className="flex items-center gap-2">
                <select
                  className="field w-28 py-2 text-sm"
                  value={s.role}
                  onChange={(e) =>
                    updateRole(s.id, e.target.value as StaffRole)
                  }
                  aria-label={`${s.name}の権限`}
                >
                  <option value="director">院長</option>
                  <option value="therapist">施術者</option>
                  <option value="receptionist">受付</option>
                </select>
                <button
                  onClick={() => toggleActive(s)}
                  className="text-xs text-gray-500 hover:underline"
                >
                  {s.active ? "無効化" : "有効化"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <p className="text-center text-xs text-gray-400">
        現在の権限: {ROLE_LABELS.director} / {ROLE_LABELS.therapist} /{" "}
        {ROLE_LABELS.receptionist}
      </p>
    </div>
  );
}
