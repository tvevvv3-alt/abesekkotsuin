import { NextResponse } from "next/server";
import { deleteRow, updateRow } from "@/lib/db";
import { TABLES, type TableName } from "@/lib/types";

export const dynamic = "force-dynamic";

function tableOf(name: string): TableName | null {
  return (TABLES as string[]).includes(name) ? (name as TableName) : null;
}

type Ctx = { params: { table: string; id: string } };

export async function PATCH(req: Request, { params }: Ctx) {
  const table = tableOf(params.table);
  if (!table) return NextResponse.json({ error: "unknown table" }, { status: 404 });
  try {
    const { id: _ignored, ...values } = await req.json();
    return NextResponse.json(await updateRow(table, params.id, values));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Ctx) {
  const table = tableOf(params.table);
  if (!table) return NextResponse.json({ error: "unknown table" }, { status: 404 });
  try {
    await deleteRow(table, params.id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
