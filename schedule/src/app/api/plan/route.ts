import { NextResponse } from "next/server";
import { PlannerError, planMeals } from "@/lib/planner";

export const dynamic = "force-dynamic";
// AI の考える時間を見込んで長めに（Vercel の上限内）
export const maxDuration = 300;

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  const { from, to, today } = await req.json();
  if (!DATE.test(from) || !DATE.test(to) || from > to) {
    return NextResponse.json({ error: "期間の指定が正しくありません" }, { status: 400 });
  }
  const days = (Date.parse(to) - Date.parse(from)) / 86400000 + 1;
  if (days > 14) return NextResponse.json({ error: "一度に作れるのは2週間分までです" }, { status: 400 });
  try {
    return NextResponse.json(await planMeals({ from, to }, DATE.test(today) ? today : from));
  } catch (e) {
    const status = e instanceof PlannerError ? 400 : 500;
    return NextResponse.json({ error: (e as Error).message }, { status });
  }
}
