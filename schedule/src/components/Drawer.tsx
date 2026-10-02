"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "カレンダー", icon: "📅" },
  { href: "/pantry", label: "家にある食材", icon: "🥕" },
  { href: "/shopping", label: "買い物リスト", icon: "🛒" },
  { href: "/recipes", label: "レシピ集", icon: "📖" },
  { href: "/settings", label: "家族と色の設定", icon: "🎨" },
];

// 画面左端の「〉」タブから開くメニュー
export default function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const path = usePathname();
  return (
    <div className={`fixed inset-0 z-40 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div
        className={`absolute inset-0 bg-black/30 transition-opacity ${open ? "opacity-100" : "opacity-0"}`}
        onClick={onClose}
      />
      <nav
        className={`absolute inset-y-0 left-0 w-64 bg-white p-5 shadow-xl transition-transform ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <p className="mb-6 text-lg font-bold">阿部家</p>
        <ul className="space-y-1">
          {LINKS.map((l) => (
            <li key={l.href}>
              <Link
                href={l.href}
                onClick={onClose}
                className={`flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] ${
                  path === l.href ? "bg-gray-100 font-bold" : "hover:bg-gray-50"
                }`}
              >
                <span>{l.icon}</span>
                {l.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

export function DrawerTab({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-label="メニュー"
      className="fixed left-0 top-24 z-30 flex h-24 w-6 items-center justify-center rounded-r-xl bg-gray-500/80 text-xl font-bold text-white"
    >
      〉
    </button>
  );
}
