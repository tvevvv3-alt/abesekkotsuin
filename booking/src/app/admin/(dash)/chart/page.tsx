import { Suspense } from "react";
import ChartBoard from "@/components/ChartBoard";

// 常に最新のHTML/JSを配信（静的キャッシュで古いプログラムを読み込ませない）。
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function Page() {
  return (
    <Suspense>
      <ChartBoard />
    </Suspense>
  );
}
