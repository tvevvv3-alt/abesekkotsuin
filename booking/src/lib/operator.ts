// 「今この端末を操作しているスタッフ」を端末に保持する（Google風のアカウント表示用）。
// 認証（Supabase Auth）とは別。共有アカウントでログインしつつ、表示上の操作者を持つ。
export interface Operator {
  id: string;
  name: string;
  image_path: string | null;
}

const KEY = "abe_operator";
const EMAIL_KEY = "abe_admin_email";

export function getOperator(): Operator | null {
  try {
    const r = localStorage.getItem(KEY);
    return r ? (JSON.parse(r) as Operator) : null;
  } catch {
    return null;
  }
}

export function setOperator(o: Operator | null) {
  try {
    if (o) localStorage.setItem(KEY, JSON.stringify(o));
    else localStorage.removeItem(KEY);
  } catch {
    /* noop */
  }
}

// 初回ログイン時のメールを端末に記憶（次回からアイコン＋パスワードだけに）
export function getSavedEmail(): string {
  try {
    return localStorage.getItem(EMAIL_KEY) || "";
  } catch {
    return "";
  }
}

export function setSavedEmail(email: string) {
  try {
    localStorage.setItem(EMAIL_KEY, email);
  } catch {
    /* noop */
  }
}
