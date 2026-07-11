import type { StaffRole, SexType, ChartType, ImageType } from "./types";

// 症例分類（1つ選択）
export const CASE_TYPES = ["外傷", "慢性", "疲労系", "その他"] as const;

// 施術チップ：施術（「その他」は自由入力欄で対応）
export const METHODS = [
  "KYT",
  "DNS",
  "運動療法",
  "ストレッチ",
  "テーピング",
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
