"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { loadStaff, loadSettings } from "@/lib/data";
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

// 院内システムの左メニュー（親＋子のグループ構造）。
// 営業時間・予約公開設定は「基本設定」内から開くのでサイドバーには出さない。
type NavItem = { href?: string; label: string; icon?: string; soon?: boolean; ext?: "form"; children?: NavItem[] };
const DEFAULT_NAV: NavItem[] = [
  { href: "/admin", label: "予約一覧", icon: "🗓️" },
  { href: "/admin/class", label: "体幹教室", icon: "🤸" },
  {
    href: "/admin/patients", label: "患者管理", icon: "👥", children: [
      { href: "/admin/new-patients", label: "新患名簿" },
      { label: "問診票", ext: "form" },
      { label: "回数券", soon: true },
      { label: "体幹評価", soon: true },
      { label: "カルテ（将来）", soon: true },
    ],
  },
  {
    href: "/admin/staff", label: "スタッフ管理", icon: "🧑‍⚕️", children: [
      { href: "/admin/shifts", label: "シフト" },
      { href: "/admin/sales", label: "売上（個別）" },
    ],
  },
  { href: "/admin/retail", label: "物販", icon: "🛍️" },
  { href: "/admin/rental", label: "レンタル", icon: "🎒" },
  { href: "/admin/sales", label: "売上", icon: "📈" },
  { href: "/admin/closures", label: "休日・休診登録", icon: "🚫" },
  { href: "/admin/services", label: "施術メニュー管理", icon: "📋" },
  { href: "/admin/equipment", label: "機器管理", icon: "🔌" },
  { href: "/admin/settings", label: "設定", icon: "⚙️" },
];
const navId = (n: NavItem) => n.href ?? "grp:" + n.label;
const NAV_ORDER_KEY = "admin_nav_order_v2";

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [operator, setOp] = useState<Operator | null>(null);
  const [staffList, setStaffList] = useState<Staff[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [order, setOrder] = useState<string[]>([]);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [formUrl, setFormUrl] = useState<string | null>(null);

  useEffect(() => {
    setOp(getOperator());
    try {
      const s = localStorage.getItem(NAV_ORDER_KEY);
      if (s) setOrder(JSON.parse(s) as string[]);
    } catch { /* noop */ }
    loadSettings(supabase).then((st) => setFormUrl(st.questionnaire_url?.trim() || null)).catch(() => {});
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

  // 保存済みの並び順を反映（上位項目のみ。未知/新規項目は既定順で末尾に追加）
  const nav = useMemo(() => {
    const byId = new Map(DEFAULT_NAV.map((n) => [navId(n), n]));
    const out: NavItem[] = [];
    order.forEach((id) => { const n = byId.get(id); if (n) { out.push(n); byId.delete(id); } });
    DEFAULT_NAV.forEach((n) => { if (byId.has(navId(n))) out.push(n); });
    return out;
  }, [order]);

  const reorder = (from: number, to: number) => {
    const arr = nav.map(navId);
    const [x] = arr.splice(from, 1);
    arr.splice(to, 0, x);
    setOrder(arr);
    try { localStorage.setItem(NAV_ORDER_KEY, JSON.stringify(arr)); } catch { /* noop */ }
  };

  const linkClass = (href: string) =>
    `flex flex-1 items-center gap-2.5 rounded-lg px-2 py-2.5 text-sm font-medium ${
      isActive(href) ? "bg-blue-600 text-white" : "text-slate-600 hover:bg-slate-100"
    }`;

  const childBase = "flex items-center gap-2 rounded-lg px-2 py-1.5 pl-8 text-[13px]";
  const renderChild = (c: NavItem) => {
    // 問診票：設定のURLがあれば外部リンク（新しいタブ）、無ければ準備中
    if (c.ext === "form") {
      return formUrl ? (
        <a key={navId(c)} href={formUrl} target="_blank" rel="noreferrer" className={`${childBase} font-medium text-slate-500 hover:bg-slate-100`}>
          <span className="text-slate-300">└</span>
          {c.label}
          <span className="ml-auto text-[10px] text-slate-400">↗</span>
        </a>
      ) : (
        <div key={navId(c)} className={`${childBase} text-slate-300`}>
          <span className="text-slate-300">└</span>
          {c.label}
          <span className="ml-auto rounded bg-slate-100 px-1 text-[9px] font-bold text-slate-400">設定でURL登録</span>
        </div>
      );
    }
    if (c.soon || !c.href) {
      return (
        <div key={navId(c)} className={`${childBase} text-slate-300`}>
          <span className="text-slate-300">└</span>
          {c.label}
          <span className="ml-auto rounded bg-slate-100 px-1 text-[9px] font-bold text-slate-400">準備中</span>
        </div>
      );
    }
    return (
      <Link
        key={navId(c)}
        href={c.href}
        onClick={() => setOpen(false)}
        className={`${childBase} font-medium ${isActive(c.href) ? "bg-blue-50 text-blue-700" : "text-slate-500 hover:bg-slate-100"}`}
      >
        <span className="text-slate-300">└</span>
        {c.label}
      </Link>
    );
  };

  const navList = (
    <nav className="flex flex-col gap-0.5 p-3">
      {nav.map((n, i) => (
        <div key={navId(n)}>
          <div
            onDragOver={(e) => { e.preventDefault(); }}
            onDrop={(e) => { e.preventDefault(); if (dragIdx !== null && dragIdx !== i) reorder(dragIdx, i); setDragIdx(null); }}
            className={`flex items-center rounded-lg ${dragIdx === i ? "opacity-40" : ""}`}
          >
            <span
              draggable
              onDragStart={() => setDragIdx(i)}
              onDragEnd={() => setDragIdx(null)}
              className="cursor-grab select-none px-1 text-sm text-slate-300 hover:text-slate-500 active:cursor-grabbing"
              title="ドラッグで並び替え"
            >
              ⠿
            </span>
            {n.href ? (
              <Link href={n.href} onClick={() => setOpen(false)} className={linkClass(n.href)}>
                <span className="text-base">{n.icon}</span>
                {n.label}
              </Link>
            ) : (
              <span className="flex flex-1 items-center gap-2.5 px-2 py-2.5 text-sm font-bold text-slate-700">
                <span className="text-base">{n.icon}</span>
                {n.label}
              </span>
            )}
          </div>
          {n.children && <div className="mb-1">{n.children.map(renderChild)}</div>}
        </div>
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

      <div className="flex w-full">
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
