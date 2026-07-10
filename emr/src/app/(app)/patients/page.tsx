"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { SEX_LABELS } from "@/lib/constants";
import type { Patient } from "@/lib/types";

export default function PatientsPage() {
  const [query, setQuery] = useState("");
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);

  const search = useCallback(async (q: string) => {
    setLoading(true);
    const supabase = createClient();
    let req = supabase
      .from("patients")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(100);

    if (q.trim()) {
      const term = `%${q.trim()}%`;
      req = req.or(
        `name.ilike.${term},name_kana.ilike.${term},patient_number.ilike.${term},phone.ilike.${term}`
      );
    }
    const { data } = await req;
    setPatients((data as Patient[]) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const t = setTimeout(() => search(query), 200);
    return () => clearTimeout(t);
  }, [query, search]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-bold">患者一覧</h1>
        <Link href="/patients/new" className="btn-primary text-sm">
          ＋新規登録
        </Link>
      </div>

      <input
        className="field"
        placeholder="氏名・フリガナ・患者ID・電話番号で検索"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        inputMode="search"
      />

      {loading ? (
        <p className="py-10 text-center text-sm text-gray-400">読み込み中…</p>
      ) : patients.length === 0 ? (
        <p className="py-10 text-center text-sm text-gray-400">
          該当する患者がいません
        </p>
      ) : (
        <ul className="space-y-2">
          {patients.map((p) => (
            <li key={p.id}>
              <Link
                href={`/patients/${p.id}`}
                className="card flex items-center justify-between hover:bg-gray-50"
              >
                <div>
                  <div className="font-semibold">
                    {p.name}
                    {p.name_kana && (
                      <span className="ml-2 text-xs text-gray-400">
                        {p.name_kana}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    ID {p.patient_number}
                    {p.sex && ` ・ ${SEX_LABELS[p.sex]}`}
                    {p.birth_date && ` ・ ${p.birth_date}`}
                  </div>
                </div>
                <span className="text-gray-300">›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
