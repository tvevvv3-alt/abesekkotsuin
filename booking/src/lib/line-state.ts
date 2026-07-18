import crypto from "crypto";

// LINEログインの state（CSRF対策＋予約IDの受け渡し）を署名して改ざんを防ぐ。
function secret(): string {
  return process.env.LINE_LOGIN_CHANNEL_SECRET || "dev-secret";
}

export function signState(appointmentId: string): string {
  const nonce = crypto.randomBytes(6).toString("hex");
  const payload = `${appointmentId}.${nonce}`;
  const sig = crypto.createHmac("sha256", secret()).update(payload).digest("base64url");
  return Buffer.from(`${payload}.${sig}`).toString("base64url");
}

export function verifyState(state: string): string | null {
  try {
    const decoded = Buffer.from(state, "base64url").toString();
    const parts = decoded.split(".");
    if (parts.length !== 3) return null;
    const [appointmentId, nonce, sig] = parts;
    const expect = crypto
      .createHmac("sha256", secret())
      .update(`${appointmentId}.${nonce}`)
      .digest("base64url");
    if (
      sig.length !== expect.length ||
      !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expect))
    )
      return null;
    return appointmentId;
  } catch {
    return null;
  }
}
