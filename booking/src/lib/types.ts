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

// 料金（スタッフ別・初診/再診）
export interface ServicePrice {
  service_id: string;
  staff_id: string;
  initial_price: number | null;
  repeat_price: number | null;
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
  image_path: string | null; // メニュー画像URL
  short_desc: string | null; // 一覧カード用の短い説明
  badge: string | null; // カードのバッジ（イチオシ/基本/集中ケア 等）
  note: string | null;
  class_starts: string | null; // 開始時刻を固定する場合（"分"カンマ区切り）
  after_hours: boolean; // 時間外予約（勤務時間に関係なく固定の夜枠のみ受付）
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
  service_id: string | null; // メニュー限定の休み（体幹教室など）。null=限定なし
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

// 予約 基本設定（1行）
export interface Settings {
  id: number;
  slot_unit: number; // 15 / 30
  same_day_ok: boolean;
  last_accept_min: number | null;
  cancel_deadline_hours: number;
  change_deadline_hours: number;
  autofill: boolean;
  recheck_on_book: boolean;
  board_start_min: number; // 管理ボード表示 開始（分）
  board_end_min: number; // 管理ボード表示 終了（分）
}

// 月別の予約公開設定
export interface BookingWindow {
  year_month: string; // 'YYYY-MM'
  open_at: string | null;
  accept_from: string | null;
  accept_to: string | null;
  published: boolean;
  note: string | null;
}

// 営業時間の基本形（曜日ごと・午前/午後の最大2枠）。
// スタッフの勤務時間へ「一括反映」するためのテンプレート。
export interface BusinessHours {
  weekday: number; // 0=日..6=土
  is_open: boolean; // その曜日を営業するか
  seg1_start: number | null; // 午前枠 開始（分）
  seg1_end: number | null; // 午前枠 終了（分）
  seg2_start: number | null; // 午後枠 開始（分）
  seg2_end: number | null; // 午後枠 終了（分）
}

// 患者情報の端末保存（2回目以降の自動入力）
export interface SavedPatient {
  name: string;
  name_kana: string;
  birth_date: string;
  phone: string;
}
