"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const NAV = [
  { href: "/admin", label: "予約一覧", icon: "🗓️" },
  { href: "/admin/closures", label: "休日・休診登録", icon: "🚫" },
  { href: "/admin/patients", label: "患者管理", icon: "👥" },
  { href: "/admin/staff", label: "スタッフ管理", icon: "🧑‍⚕️" },
  { href: "/admin/services", label: "施術メニュー管理", icon: "📋" },
  { href: "/admin/equipment", label: "機器管理", icon: "🔌" },
  { href: "/admin/publish", label: "予約公開設定", icon: "📢" },
  { href: "/admin/settings", label: "基本設定", icon: "⚙️" },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);

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
        <span className="font-bold text-slate-800">阿部接骨院 予約管理</span>
        <button onClick={logout} className="text-xs text-slate-500">
          ログアウト
        </button>
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
          </div>
          <div className="flex-1 overflow-y-auto">{navList}</div>
          <button
            onClick={logout}
            className="border-t px-4 py-3 text-left text-sm text-slate-500 hover:bg-slate-50"
          >
            ログアウト
          </button>
        </aside>

        <main className="min-w-0 flex-1 px-4 py-4 md:px-6">{children}</main>
      </div>
    </div>
  );
}
