"use client";

import { useEffect, useState } from "react";
import PageHeader from "@/components/PageHeader";
import { api, settings } from "@/lib/api";
import { ageLabel, toDateStr } from "@/lib/date";
import { ROLE_LABEL } from "@/lib/labels";
import type { Member, Role } from "@/lib/types";

const SWATCHES = ["#3b82f6", "#ec4899", "#22c55e", "#f59e0b", "#a855f7", "#ef4444", "#14b8a6", "#f97316", "#6366f1", "#84cc16"];

export default function SettingsPage() {
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);

  const load = () =>
    api
      .list<Member>("members")
      .then(setMembers)
      .catch((e) => setError(e.message));
  useEffect(() => {
    load();
  }, []);

  const [prefs, setPrefs] = useState("");
  const [prefsSaved, setPrefsSaved] = useState(false);
  useEffect(() => {
    settings
      .get("preferences")
      .then((r) => setPrefs(r.value))
      .catch((e) => setError(e.message));
  }, []);

  const patch = async (m: Member, values: Partial<Member>) => {
    setMembers((list) => list.map((x) => (x.id === m.id ? { ...x, ...values } : x)));
    try {
      await api.update<Member>("members", m.id, values);
    } catch (e) {
      setError((e as Error).message);
      load();
    }
  };

  const move = async (i: number, dir: -1 | 1) => {
    const a = members[i];
    const b = members[i + dir];
    if (!a || !b) return;
    await Promise.all([
      api.update<Member>("members", a.id, { sort: b.sort }),
      api.update<Member>("members", b.id, { sort: a.sort }),
    ]);
    load();
  };

  const add = async () => {
    const sort = Math.max(0, ...members.map((m) => m.sort)) + 1;
    await api.create<Member>("members", {
      name: "新しい家族",
      role: "child",
      birth_date: null,
      color: SWATCHES[members.length % SWATCHES.length],
      sort,
    });
    load();
  };

  const today = toDateStr(new Date());

  return (
    <main className="pb-16">
      <PageHeader title="家族と色の設定" />
      {error && <p className="mx-5 mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <ul className="space-y-3 px-4">
        {members.map((m, i) => (
          <li key={m.id} className="rounded-2xl border border-gray-200 p-4">
            <div className="flex items-center gap-3">
              <span className="h-9 w-9 shrink-0 rounded-full" style={{ background: m.color }} />
              <input
                value={m.name}
                onChange={(e) => setMembers((l) => l.map((x) => (x.id === m.id ? { ...x, name: e.target.value } : x)))}
                onBlur={(e) => e.target.value.trim() && patch(m, { name: e.target.value.trim() })}
                className="input flex-1 font-bold"
              />
              <div className="flex flex-col">
                <button onClick={() => move(i, -1)} disabled={i === 0} className="px-2 text-gray-500 disabled:opacity-20">
                  ▲
                </button>
                <button
                  onClick={() => move(i, 1)}
                  disabled={i === members.length - 1}
                  className="px-2 text-gray-500 disabled:opacity-20"
                >
                  ▼
                </button>
              </div>
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              {SWATCHES.map((c) => (
                <button
                  key={c}
                  onClick={() => patch(m, { color: c })}
                  aria-label={`色 ${c}`}
                  className={`h-7 w-7 rounded-full ${m.color === c ? "ring-2 ring-black ring-offset-2" : ""}`}
                  style={{ background: c }}
                />
              ))}
              <label className="relative h-7 w-7 overflow-hidden rounded-full border border-dashed border-gray-400 text-center text-xs leading-7 text-gray-500">
                ＋
                <input
                  type="color"
                  value={m.color}
                  onChange={(e) => patch(m, { color: e.target.value })}
                  className="absolute inset-0 opacity-0"
                />
              </label>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <select
                value={m.role}
                onChange={(e) => patch(m, { role: e.target.value as Role })}
                className="input"
              >
                {(Object.keys(ROLE_LABEL) as Role[]).map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={m.birth_date ?? ""}
                onChange={(e) => patch(m, { birth_date: e.target.value || null })}
                className="input"
                aria-label="誕生日"
              />
            </div>
            <p className="mt-1 text-xs text-gray-400">
              {m.role === "child"
                ? `誕生日から年齢に合わせた献立にします${ageLabel(m.birth_date, today) ? `（いま ${ageLabel(m.birth_date, today)}）` : ""}`
                : "誕生日は空欄でOK"}
            </p>

            <button
              onClick={async () => {
                if (!confirm(`${m.name} を削除しますか？`)) return;
                await api.remove("members", m.id);
                load();
              }}
              className="mt-2 text-xs text-red-500"
            >
              削除
            </button>
          </li>
        ))}
      </ul>
      <div className="px-4 pt-4">
        <button onClick={add} className="w-full rounded-2xl border-2 border-dashed border-gray-300 py-3 font-bold text-gray-500">
          ＋ 家族を追加
        </button>
      </div>

      <section className="px-4 pt-8">
        <h2 className="text-lg font-extrabold">阿部家の好み・ルール</h2>
        <p className="mb-2 mt-1 text-xs text-gray-500">
          献立を作るとき、AI が毎回ここを読みます。好きな料理・苦手なもの・よく使うお店などを自由に書いてください。
        </p>
        <textarea
          value={prefs}
          onChange={(e) => {
            setPrefs(e.target.value);
            setPrefsSaved(false);
          }}
          rows={14}
          className="input text-sm leading-relaxed"
        />
        <button
          onClick={async () => {
            await settings.put("preferences", prefs);
            setPrefsSaved(true);
          }}
          className="mt-2 w-full rounded-2xl bg-black py-3 font-bold text-white"
        >
          {prefsSaved ? "保存しました ✓" : "保存"}
        </button>
      </section>
    </main>
  );
}
