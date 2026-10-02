import { NextResponse } from "next/server";
import { insertRow, listRows } from "@/lib/db";
import { TABLES, type TableName } from "@/lib/types";

export const dynamic = "force-dynamic";

function tableOf(name: string): TableName | null {
  return (TABLES as string[]).includes(name) ? (name as TableName) : null;
}

export async function GET(req: Request, { params }: { params: { table: string } }) {
  const table = tableOf(params.table);
  if (!table) return NextResponse.json({ error: "unknown table" }, { status: 404 });
  const url = new URL(req.url);
  try {
    const rows = await listRows(table, {
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
    });
    return NextResponse.json(rows);
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: { table: string } }) {
  const table = tableOf(params.table);
  if (!table) return NextResponse.json({ error: "unknown table" }, { status: 404 });
  try {
    const { id: _ignored, ...values } = await req.json();
    return NextResponse.json(await insertRow(table, values));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
