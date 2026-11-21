import { Suspense } from "react";
import ChartBoard from "@/components/ChartBoard";

export default function Page() {
  return (
    <Suspense>
      <ChartBoard />
    </Suspense>
  );
}
