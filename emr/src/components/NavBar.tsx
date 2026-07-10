"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ROLE_LABELS } from "@/lib/constants";
import type { Staff } from "@/lib/types";

const links = [
  { href: "/patients", label: "患者" },
  { href: "/handover", label: "申し送り" },
];

export default function NavBar({ staff }: { staff: Staff }) {
  const pathname = usePathname();
  const router = useRouter();

  async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-20 border-b border-gray-100 bg-white/90 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
        <Link href="/patients" className="font-bold">
          阿部接骨院<span className="ml-1 text-xs text-gray-400">EMR</span>
        </Link>
        <nav className="flex items-center gap-1">
          {links.map((l) => {
            const active = pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                  active
                    ? "bg-brand/10 text-brand"
                    : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
          {staff.role === "director" && (
            <Link
              href="/admin/staff"
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                pathname.startsWith("/admin")
                  ? "bg-brand/10 text-brand"
                  : "text-gray-600 hover:bg-gray-50"
              }`}
            >
              スタッフ
            </Link>
          )}
        </nav>
        <button
          onClick={signOut}
          className="hidden text-sm text-gray-500 hover:text-gray-800 sm:block"
          title={`${staff.name}（${ROLE_LABELS[staff.role]}）`}
        >
          ログアウト
        </button>
      </div>
    </header>
  );
}
