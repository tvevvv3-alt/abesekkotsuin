import type { StaffRole, SexType, ChartType, ImageType } from "./types";

// 症例分類（1つ選択）
export const CASE_TYPES = ["外傷", "慢性", "疲労系", "その他"] as const;

// 施術：機器・手技ごとの詳細入力項目の定義
export type ModalityFieldKey = "site" | "protocol" | "content" | "finding";
export interface ModalityField {
  key: ModalityFieldKey;
  label: string;
  area?: boolean;
}
export interface ModalityDef {
  name: string;
  fields: ModalityField[];
}

export const MODALITIES: ModalityDef[] = [
  { name: "エコー", fields: [{ key: "finding", label: "所見", area: true }] },
  {
    name: "アキュスコープ",
    fields: [
      { key: "site", label: "部位" },
      { key: "protocol", label: "設定・プロトコル" },
    ],
  },
  {
    name: "マイオパルス",
    fields: [
      { key: "site", label: "部位" },
      { key: "protocol", label: "設定・プロトコル" },
    ],
  },
  {
    name: "ブラックアキュマイオ",
    fields: [
      { key: "site", label: "部位" },
      { key: "protocol", label: "設定・プロトコル" },
    ],
  },
  {
    name: "エレサス",
    fields: [
      { key: "site", label: "部位" },
      { key: "protocol", label: "設定" },
    ],
  },
  { name: "ハイチャージNEO", fields: [{ key: "content", label: "内容" }] },
  {
    name: "ディープオシレーション",
    fields: [
      { key: "site", label: "部位" },
      { key: "content", label: "内容" },
    ],
  },
  { name: "手技", fields: [{ key: "content", label: "内容", area: true }] },
  { name: "運動療法", fields: [{ key: "content", label: "内容", area: true }] },
  { name: "DNS", fields: [{ key: "content", label: "内容", area: true }] },
  { name: "テーピング", fields: [{ key: "content", label: "部位・種類" }] },
];

export const OTHER_MODALITY = "その他";

// 機器名 → 定義の索引
export const MODALITY_MAP: Record<string, ModalityDef> = Object.fromEntries(
  MODALITIES.map((m) => [m.name, m])
);

export const ROLE_LABELS: Record<StaffRole, string> = {
  director: "院長",
  therapist: "施術者",
  receptionist: "受付",
};

export const SEX_LABELS: Record<SexType, string> = {
  male: "男性",
  female: "女性",
  other: "その他",
};

export const CHART_TYPE_LABELS: Record<ChartType, string> = {
  initial: "初診",
  followup: "再診",
};

export const IMAGE_TYPE_LABELS: Record<ImageType, string> = {
  echo: "エコー画像",
  photo: "患部写真",
};

// 権限ヘルパー
export const canEditPatient = (role?: StaffRole) =>
  role === "director" || role === "receptionist";
export const canWriteChart = (role?: StaffRole) =>
  role === "director" || role === "therapist";
export const canDelete = (role?: StaffRole) => role === "director";
export const canManageStaff = (role?: StaffRole) => role === "director";
