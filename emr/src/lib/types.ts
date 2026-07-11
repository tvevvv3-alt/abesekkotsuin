// アプリ全体で使う型定義

export type StaffRole = "director" | "therapist" | "receptionist";
export type SexType = "male" | "female" | "other";
export type ChartType = "initial" | "followup";
export type ImageType = "echo" | "photo";

export interface Staff {
  id: string;
  name: string;
  role: StaffRole;
  active: boolean;
  created_at: string;
}

export interface Patient {
  id: string;
  patient_number: string;
  name: string;
  name_kana: string | null;
  birth_date: string | null;
  sex: SexType | null;
  phone: string | null;
  address: string | null;
  school: string | null;
  team: string | null;
  sport: string | null;
  position: string | null;
  guardian_name: string | null;
  guardian_contact: string | null;
  medical_history: string | null;
  allergies: string | null;
  assigned_staff_id: string | null;
  first_visit_date: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

// 施術：機器ごとの構造化エントリ（検索・分析用）
export interface TreatmentItem {
  modality: string; // 機器・手技名（その他の場合は "その他"）
  label?: string; // 「その他」選択時の自由名称
  site?: string; // 部位（例: ATFL, 帯脈, 外果周囲）
  protocol?: string; // 設定・プロトコル（例: 局所通電, 8Hz）
  content?: string; // 内容 / 部位・種類
  finding?: string; // 所見（エコー）
}

export interface Treatments {
  items: TreatmentItem[]; // 機器ごとの施術記録
  approach?: string; // 効果的だったアプローチ（任意の補足メモ）
}

// 部位ごとの疼痛スコア（施術前→施術後）。複数部位に対応。
export interface Site {
  name: string; // 部位名（例: 右足関節）
  pain_pre: number | null; // 施術前 0〜10
  pain_post: number | null; // 施術後 0〜10
}

// 初診／再診カルテの可変項目（jsonb data）
export interface ChartData {
  case_type?: string; // 症例分類（外傷/慢性/疲労系）
  main_symptoms?: string; // 主な症状
  // 初診
  chief_complaint?: string; // 主訴
  injury_date?: string; // 受傷日
  injury_mechanism?: string; // 受傷機転
  hospital_history?: string; // 病院受診歴
  diagnosis?: string; // 診断名
  imaging_history?: string; // 画像検査歴
  tenderness?: string; // 圧痛
  swelling?: string; // 腫脹
  heat?: string; // 熱感
  bruising?: string; // 内出血
  rom?: string; // ROM
  muscle_strength?: string; // 筋力
  special_test?: string; // スペシャルテスト
  echo_finding?: string; // エコー所見
  assessment?: string; // 評価
  treatment_plan?: string; // 施術計画
  return_estimate?: string; // 競技復帰目安
  next_check?: string; // 次回確認事項
  // 再診
  change_from_last?: string; // 前回からの変化
  practice_status?: string; // 練習参加状況
  post_treatment_change?: string; // 施術後の変化
  self_care?: string; // セルフケア
}

export interface Chart {
  id: string;
  patient_id: string;
  chart_type: ChartType;
  visit_date: string;
  author_id: string | null;
  pain_score: number | null; // 旧・単一スコア（後方互換のため保持）
  sites: Site[]; // 部位別 施術前後スコア
  treatments: Treatments;
  data: ChartData;
  created_at: string;
  updated_at: string;
}

export interface PatientImage {
  id: string;
  patient_id: string;
  chart_id: string | null;
  image_type: ImageType;
  storage_path: string;
  taken_on: string;
  caption: string | null;
  uploaded_by: string | null;
  created_at: string;
}

export interface Handover {
  id: string;
  body: string;
  author_id: string | null;
  resolved: boolean;
  created_at: string;
}
