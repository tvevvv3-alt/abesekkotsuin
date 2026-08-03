"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import CoreEvalEditor from "@/components/CoreEvalEditor";

export default function CoreEvalBoard() {
  const supabase = useMemo(() => createClient(), []);
  const [names, setNames] = useState<string[]>([]);
  const [name, setName] = useState("");

  // 名前候補（体幹会員＋評価履歴）
  useEffect(() => {
    (async () => {
      const [{ data: cm }, { data: ev }] = await Promise.all([
        supabase.from("class_members").select("name"),
        supabase.from("core_evaluations").select("name"),
      ]);
      const set = new Set<string>();
      (cm ?? []).forEach((x: { name: string }) => x.name && set.add(x.name));
      (ev ?? []).forEach((x: { name: string }) => x.name && set.add(x.name));
      setNames(Array.from(set).sort((a, b) => a.localeCompare(b, "ja")));
    })();
  }, [supabase]);

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold text-slate-800">体幹評価</h1>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-500">3ヶ月に1回</span>
        <span className="text-[11px] text-slate-400">
          ※ LINEに送るときは、予約ボードやカレンダーの「体幹テスト」から開くと送信先が確実です。
        </span>
      </div>
      <CoreEvalEditor name={name} editableName names={names} onNameChange={setName} />
    </div>
  );
}
