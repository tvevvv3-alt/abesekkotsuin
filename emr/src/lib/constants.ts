import type { StaffRole, SexType, ChartType, ImageType } from "./types";

// 施術チップ：機器
export const MACHINES = [
  "アキュスコープ",
  "マイオパルス",
  "ブラックアキュマイオ",
  "エレサス",
  "ハイチャージNEO",
  "ディープオシレーション",
  "エコー",
] as const;

// 施術チップ：施術（「その他」は自由入力欄で対応）
export const METHODS = [
  "手技療法",
  "DNS",
  "運動療法",
  "ストレッチ",
  "テーピング",
  "アイシング",
  "温熱療法",
] as const;

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
