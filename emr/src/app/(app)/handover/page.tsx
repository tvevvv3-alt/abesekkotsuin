"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Handover, Staff } from "@/lib/types";

interface Row extends Handover {
  author_name?: string;
}

export default function HandoverPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [body, setBody] = useState("");
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [me, setMe] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    setMe(user?.id ?? null);

    const [{ data: notes }, { data: staff }] = await Promise.all([
      supabase
        .from("handovers")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100),
      supabase.from("staff").select("id,name"),
    ]);

    const map = new Map(
      ((staff as Pick<Staff, "id" | "name">[]) ?? []).map((s) => [s.id, s.name])
    );
    setRows(
      ((notes as Handover[]) ?? []).map((n) => ({
        ...n,
        author_name: n.author_id ? map.get(n.author_id) : "―",
      }))
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function post(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setPosting(true);
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    await supabase
      .from("handovers")
      .insert({ body: body.trim(), author_id: user?.id });
    setBody("");
    setPosting(false);
    load();
  }

  async function toggle(n: Row) {
    const supabase = createClient();
    await supabase
      .from("handovers")
      .update({ resolved: !n.resolved })
      .eq("id", n.id);
    load();
  }

  async function remove(n: Row) {
    if (!confirm("削除しますか？")) return;
    const supabase = createClient();
    await supabase.from("handovers").delete().eq("id", n.id);
    load();
  }

  return (
    <div className="space-y-5">
      <h1 className="text-lg font-bold">スタッフ申し送り</h1>

      <form onSubmit={post} className="card space-y-3">
        <textarea
          className="field min-h-24"
          placeholder="申し送り内容を入力…"
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
        <button type="submit" className="btn-primary w-full" disabled={posting}>
          {posting ? "投稿中…" : "投稿"}
        </button>
      </form>

      {loading ? (
        <p className="text-sm text-gray-400">読み込み中…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-400">申し送りはまだありません</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((n) => (
            <li
              key={n.id}
              className={`card ${n.resolved ? "opacity-60" : ""}`}
            >
              <p className="whitespace-pre-wrap text-sm">{n.body}</p>
              <div className="mt-2 flex items-center justify-between text-xs text-gray-400">
                <span>
                  {n.author_name} ・{" "}
                  {new Date(n.created_at).toLocaleString("ja-JP", {
                    month: "numeric",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="flex gap-3">
                  <button
                    onClick={() => toggle(n)}
                    className={n.resolved ? "text-gray-400" : "text-brand"}
                  >
                    {n.resolved ? "未対応に戻す" : "対応済みにする"}
                  </button>
                  {n.author_id === me && (
                    <button
                      onClick={() => remove(n)}
                      className="text-red-500"
                    >
                      削除
                    </button>
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
