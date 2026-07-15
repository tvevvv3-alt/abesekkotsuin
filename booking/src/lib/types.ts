// 予約システムの型定義

export interface Staff {
  id: string;
  name: string;
  role: string;
  active: boolean;
  color: string | null; // 担当者カラー（例: #2563eb）
  sort_order: number;
  bookable: boolean;
}

export interface Equipment {
  id: string;
  name: string;
  capacity: number; // 同時利用人数（ハイチャージ=4）
  active: boolean;
  sort_order: number;
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  recommended: boolean; // イチオシ表示
  sort_order: number;
}

// メニューを構成する工程テンプレート
export interface ServiceStep {
  id: string;
  service_id: string;
  step_order: number;
  name: string; // 例: 全身通電 / 施術
  duration_min: number; // 所要時間（分）
  uses_staff: boolean; // 担当者を拘束するか
  equipment_id: string | null; // 使用機器
  headcount: number; // 機器の占有人数
}

// メニュー＋工程をまとめた表示用
export interface ServiceWithSteps extends Service {
  steps: ServiceStep[];
}

export interface StaffSchedule {
  id: string;
  staff_id: string;
  weekday: number; // 0=日..6=土
  start_min: number;
  end_min: number;
}

export interface Closure {
  id: string;
  date: string; // YYYY-MM-DD
  staff_id: string | null; // null=院全体
  start_min: number | null; // null=終日
  end_min: number | null;
  reason: string | null;
}

export interface Patient {
  id: string;
  patient_number: string;
  name: string;
  name_kana: string | null;
  birth_date: string | null;
  phone: string | null;
}

export interface Appointment {
  id: string;
  patient_id: string | null;
  service_id: string | null;
  staff_id: string | null;
  date: string;
  start_min: number;
  end_min: number;
  status: "booked" | "cancelled" | "done";
  source: "patient" | "admin";
  note: string | null;
  patient_name: string | null;
  service_name: string | null;
}

// 予約可否判定に使う「工程の占有」レコード（匿名でも取得可）
export interface AppointmentStep {
  id: string;
  appointment_id: string;
  step_order: number;
  name: string;
  date: string;
  start_min: number;
  end_min: number;
  uses_staff: boolean;
  staff_id: string | null;
  equipment_id: string | null;
  headcount: number;
}

// 患者情報の端末保存（2回目以降の自動入力）
export interface SavedPatient {
  name: string;
  name_kana: string;
  birth_date: string;
  phone: string;
}
