"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadStaff } from "@/lib/data";
import type { Staff } from "@/lib/types";
import { getOperator, setOperator, type Operator } from "@/lib/operator";

// 操作者アイコン（顔写真 or 頭文字）
function OperatorAvatar({
  op,
  size = 32,
}: {
  op: { name: string; image_path: string | null; color?: string | null };
  size?: number;
}) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full"
      style={{ width: size, height: size, backgroundColor: op.color || "#64748b" }}
    >
      {op.image_path ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={op.image_path} alt={op.name} className="h-full w-full object-cover" />
      ) : (
        <span className="text-xs font-bold text-white">{op.name.slice(0, 1)}</span>
      )}
    </span>
  );
}

const NAV = [
  { href: "/admin", label: "予約一覧", icon: "🗓️" },
  { href: "/admin/class", label: "体幹教室", icon: "🤸" },
  { href: "/admin/closures", label: "休日・休診登録", icon: "🚫" },
  { href: "/admin/patients", label: "患者管理", icon: "👥" },
  { href: "/admin/staff", label: "スタッフ管理", icon: "🧑‍⚕️" },
  { href: "/admin/services", label: "施術メニュー管理", icon: "📋" },
  { href: "/admin/equipment", label: "機器管理", icon: "🔌" },
  { href: "/admin/hours", label: "営業時間", icon: "🕐" },
  { href: "/admin/publish", label: "予約公開設定", icon: "📢" },
  { href: "/admin/settings", label: "基本設定", icon: "⚙️" },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [operator, setOp] = useState<Operator | null>(null);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setOp(getOperator());
    (async () => {
      try {
        const st = await loadStaff(supabase, false);
        setStaffList(st.filter((s) => s.admin_visible !== false));
      } catch {
        /* noop */
      }
    })();
  }, [supabase]);

  function chooseOperator(s: Staff) {
    const o = { id: s.id, name: s.name, image_path: s.image_path };
    setOperator(o);
    setOp(o);
    setPickerOpen(false);
  }

  async function logout() {
    const sb = createClient();
    await sb.auth.signOut();
    router.replace("/admin/login");
    router.refresh();
  }

  const isActive = (href: string) =>
    href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);

  const navList = (
    <nav className="flex flex-col gap-1 p-3">
      {NAV.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          onClick={() => setOpen(false)}
          className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium ${
            isActive(n.href)
              ? "bg-blue-600 text-white"
              : "text-slate-600 hover:bg-slate-100"
          }`}
        >
          <span className="text-base">{n.icon}</span>
          {n.label}
        </Link>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-100">
      {/* モバイル用ヘッダ（ハンバーガー） */}
      <header className="sticky top-0 z-40 flex items-center justify-between border-b bg-white px-4 py-3 md:hidden">
        <button
          onClick={() => setOpen(true)}
          className="rounded-md p-1.5 text-slate-700 hover:bg-slate-100"
          aria-label="メニュー"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        </button>
        <span className="font-bold text-slate-800">阿部接骨院</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setPickerOpen(true)}
            className="flex items-center gap-1.5"
            aria-label="操作者を切替"
          >
            {operator ? (
              <OperatorAvatar op={operator} size={30} />
            ) : (
              <span className="rounded-full border border-dashed border-slate-300 px-2 py-1 text-[10px] text-slate-400">
                担当を選択
              </span>
            )}
          </button>
          <button onClick={logout} className="text-xs text-slate-500">
            ログアウト
          </button>
        </div>
      </header>

      {/* モバイル：ドロワー */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-0 h-full w-64 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b px-4 py-3">
              <span className="font-bold text-slate-800">メニュー</span>
              <button onClick={() => setOpen(false)} className="text-slate-400">
                ✕
              </button>
            </div>
            {navList}
          </div>
        </div>
      )}

      <div className="mx-auto flex max-w-6xl">
        {/* デスクトップ：サイドメニュー */}
        <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r bg-white md:flex">
          <div className="border-b px-4 py-4">
            <div className="font-bold text-slate-800">阿部接骨院</div>
            <div className="text-xs text-slate-400">予約管理</div>
            <button
              onClick={() => setPickerOpen(true)}
              className="mt-3 flex w-full items-center gap-2 rounded-lg border border-slate-200 px-2 py-1.5 text-left hover:bg-slate-50"
            >
              {operator ? (
                <>
                  <OperatorAvatar op={operator} size={30} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-slate-700">
                      {operator.name}
                    </span>
                    <span className="block text-[10px] text-slate-400">切替</span>
                  </span>
                </>
              ) : (
                <span className="text-xs text-slate-400">担当を選択 ›</span>
              )}
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">{navList}</div>
          <button
            onClick={logout}
            className="border-t px-4 py-3 text-left text-sm text-slate-500 hover:bg-slate-50"
          >
            ログアウト
          </button>
        </aside>

        <main className="min-w-0 flex-1 px-2 py-4 md:px-3">{children}</main>
      </div>

      {/* 操作者の切替（Google風） */}
      {pickerOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-black/40" onClick={() => setPickerOpen(false)} />
          <div className="relative w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl">
            <div className="mb-3 text-center text-sm font-bold text-slate-700">
              操作しているスタッフを選択
            </div>
            <div className="grid grid-cols-4 gap-3">
              {staffList.map((s) => {
                const on = operator?.id === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => chooseOperator(s)}
                    className="flex flex-col items-center gap-1"
                  >
                    <span className={`rounded-full ${on ? "ring-2 ring-blue-600 ring-offset-2" : ""}`}>
                      <OperatorAvatar op={s} size={46} />
                    </span>
                    <span className="max-w-[56px] truncate text-[10px] text-slate-600">
                      {s.name}
                    </span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setPickerOpen(false)}
              className="mt-4 w-full rounded-lg border py-2 text-sm text-slate-500"
            >
              閉じる
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
