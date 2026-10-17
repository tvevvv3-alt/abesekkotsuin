import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { promises as fs } from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type { TableName } from "./types";
import { seedData } from "./seed";

// データの読み書き。Supabase の環境変数があれば Supabase、無ければ
// ローカル開発用に .data/db.json を使う（Vercel 本番では必ず Supabase を設定）。

type Row = { id: string } & Record<string, unknown>;
type Filter = { from?: string; to?: string };

let supabase: SupabaseClient | null | undefined;
function sb(): SupabaseClient | null {
  if (supabase !== undefined) return supabase;
  // Supabase の画面からコピーすると末尾に /rest/v1/ が付くことがあるので取り除く
  const url = (process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL)
    ?.trim()
    .replace(/\/rest\/v1\/?$/, "")
    .replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  supabase = url && key ? createClient(url, key, { auth: { persistSession: false } }) : null;
  return supabase;
}

// 日付で絞り込むテーブル
const DATED: Partial<Record<TableName, true>> = { events: true, meal_plans: true };
const ORDER: Record<TableName, string> = {
  members: "sort",
  events: "date",
  meal_plans: "date",
  pantry_items: "expires_on",
  shopping_items: "created_at",
  custom_recipes: "created_at",
};

// ---- ローカル JSON ----
const FILE = path.join(process.cwd(), ".data", "db.json");
type LocalDb = Record<TableName, Row[]> & { app_settings?: { id: string; value: string }[] };

async function readLocal(): Promise<LocalDb> {
  try {
    return JSON.parse(await fs.readFile(FILE, "utf8"));
  } catch {
    const db = seedData() as LocalDb;
    await writeLocal(db);
    return db;
  }
}
async function writeLocal(db: LocalDb) {
  await fs.mkdir(path.dirname(FILE), { recursive: true });
  await fs.writeFile(FILE, JSON.stringify(db, null, 2));
}

function sortRows(table: TableName, rows: Row[]): Row[] {
  const k = ORDER[table];
  return [...rows].sort((a, b) => {
    const av = a[k] as string | number | null | undefined;
    const bv = b[k] as string | number | null | undefined;
    if (av == null) return bv == null ? 0 : 1;
    if (bv == null) return -1;
    return av < bv ? -1 : av > bv ? 1 : 0;
  });
}

// ---- 公開関数 ----
export async function listRows(table: TableName, f: Filter = {}): Promise<Row[]> {
  const client = sb();
  if (client) {
    let q = client.from(table).select("*").order(ORDER[table], { ascending: true, nullsFirst: false });
    if (DATED[table] && f.from) q = q.gte("date", f.from);
    if (DATED[table] && f.to) q = q.lte("date", f.to);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return data as Row[];
  }
  const db = await readLocal();
  let rows = db[table] ?? [];
  if (DATED[table]) {
    rows = rows.filter(
      (r) => (!f.from || (r.date as string) >= f.from) && (!f.to || (r.date as string) <= f.to)
    );
  }
  return sortRows(table, rows);
}

export async function insertRow(table: TableName, values: Record<string, unknown>): Promise<Row> {
  const client = sb();
  if (client) {
    const { data, error } = await client.from(table).insert(values).select().single();
    if (error) throw new Error(error.message);
    return data as Row;
  }
  const db = await readLocal();
  const row = { id: randomUUID(), created_at: new Date().toISOString(), ...values } as Row;
  db[table] = [...(db[table] ?? []), row];
  await writeLocal(db);
  return row;
}

export async function updateRow(table: TableName, id: string, values: Record<string, unknown>): Promise<Row> {
  const client = sb();
  if (client) {
    const { data, error } = await client.from(table).update(values).eq("id", id).select().single();
    if (error) throw new Error(error.message);
    return data as Row;
  }
  const db = await readLocal();
  const idx = (db[table] ?? []).findIndex((r) => r.id === id);
  if (idx < 0) throw new Error("not found");
  db[table][idx] = { ...db[table][idx], ...values, id };
  await writeLocal(db);
  return db[table][idx];
}

export async function deleteRow(table: TableName, id: string): Promise<void> {
  const client = sb();
  if (client) {
    const { error } = await client.from(table).delete().eq("id", id);
    if (error) throw new Error(error.message);
    return;
  }
  const db = await readLocal();
  db[table] = (db[table] ?? []).filter((r) => r.id !== id);
  await writeLocal(db);
}

// ---- 設定（キーと値。例：preferences = 阿部家の好み・ルール） ----
export async function getSetting(key: string): Promise<string | null> {
  const client = sb();
  if (client) {
    const { data, error } = await client.from("app_settings").select("value").eq("id", key).maybeSingle();
    if (error) throw new Error(error.message);
    return (data?.value as string | undefined) ?? null;
  }
  const db = await readLocal();
  return db.app_settings?.find((r) => r.id === key)?.value ?? null;
}

export async function setSetting(key: string, value: string): Promise<void> {
  const client = sb();
  if (client) {
    const { error } = await client
      .from("app_settings")
      .upsert({ id: key, value, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return;
  }
  const db = await readLocal();
  db.app_settings = [...(db.app_settings ?? []).filter((r) => r.id !== key), { id: key, value }];
  await writeLocal(db);
}
