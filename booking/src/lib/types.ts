// 予約システムの型定義

export type StaffStatus = "active" | "paused" | "retired" | "hidden";

export interface Staff {
  id: string;
  name: string;
  role: string;
  active: boolean;
  color: string | null; // 担当者カラー（例: #2563eb）
  sort_order: number;
  bookable: boolean; // 予約受付ON/OFF
  name_kana: string | null;
  display_name: string | null; // 患者向け表示名
  patient_visible: boolean; // 患者画面に表示
  admin_visible: boolean; // 管理画面に表示
  status: StaffStatus; // 在籍中/休止中/退職/非表示
  bio: string | null;
  image_path: string | null;
  clinic: string | null;
  note: string | null;
}

// スタッフ×メニュー 対応
export interface StaffService {
  staff_id: string;
  service_id: string;
}

export interface Equipment {
  id: string;
  name: string;
  capacity: number; // 同時利用人数（ハイチャージ=4）
  active: boolean;
  sort_order: number;
  visible: boolean; // 表示ON/OFF
  note: string | null;
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  recommended: boolean; // イチオシ表示
  capacity: number; // 1=通常 / 2以上=定員制クラス（体幹教室=4）
  sort_order: number;
  category: string; // 施術メニュー/体幹教室/川西整体院/その他
  patient_name: string | null; // 患者向け表示名（未設定なら name）
  published: boolean; // 公開/非公開
  new_booking: boolean; // 新規受付ON/OFF
  image_path: string | null;
  note: string | null;
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
  patient_visible?: boolean; // 患者画面に工程を表示するか
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
  service_id: string | null; // 定員制クラスの人数集計用
  headcount: number;
}

// 患者情報の端末保存（2回目以降の自動入力）
export interface SavedPatient {
  name: string;
  name_kana: string;
  birth_date: string;
  phone: string;
}
