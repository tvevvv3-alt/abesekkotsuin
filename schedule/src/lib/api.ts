"use client";

import type { TableName } from "./types";

// 画面から /api/[table] を呼ぶ小さなヘルパー
async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "content-type": "application/json" },
    cache: "no-store",
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? "通信に失敗しました");
  return body as T;
}

export const api = {
  list<T>(table: TableName, range?: { from: string; to: string }) {
    const q = range ? `?from=${range.from}&to=${range.to}` : "";
    return call<T[]>(`/api/${table}${q}`);
  },
  create<T>(table: TableName, values: Partial<T>) {
    return call<T>(`/api/${table}`, { method: "POST", body: JSON.stringify(values) });
  },
  update<T>(table: TableName, id: string, values: Partial<T>) {
    return call<T>(`/api/${table}/${id}`, { method: "PATCH", body: JSON.stringify(values) });
  },
  remove(table: TableName, id: string) {
    return call<{ ok: true }>(`/api/${table}/${id}`, { method: "DELETE" });
  },
};

export function makePlan(from: string, to: string, today: string) {
  return call<{ saved: number; note: string }>("/api/plan", {
    method: "POST",
    body: JSON.stringify({ from, to, today }),
  });
}

export const settings = {
  get(key: string) {
    return call<{ value: string }>(`/api/settings/${key}`);
  },
  put(key: string, value: string) {
    return call<{ ok: true }>(`/api/settings/${key}`, { method: "PUT", body: JSON.stringify({ value }) });
  },
};
