"use client";

import { useState } from "react";
import Drawer, { DrawerTab } from "./Drawer";

// カレンダー以外の画面の共通ヘッダー
export default function PageHeader({ title }: { title: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <DrawerTab onClick={() => setOpen(true)} />
      <Drawer open={open} onClose={() => setOpen(false)} />
      <header className="px-5 pb-3 pt-6">
        <h1 className="text-2xl font-extrabold">{title}</h1>
      </header>
    </>
  );
}
