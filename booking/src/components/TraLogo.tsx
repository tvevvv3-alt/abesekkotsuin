// TRA 阿部接骨院のブランドバッジと、ロゴをくるくる回すローディング表示。
const NAVY = "#0f1f40";
const GOLD = "#c9a24b";

// ブランドバッジ（SVG）。ロゴ画像が無い場合のフォールバックにも使う。
export function TraBadge({ size = 168 }: { size?: number }) {
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label="TRA 阿部接骨院 大阪茨木">
      <circle cx="100" cy="100" r="98" fill={NAVY} />
      <circle cx="100" cy="100" r="93" fill="none" stroke={GOLD} strokeWidth="2.5" />
      <text x="100" y="84" textAnchor="middle" fontSize="50" fontWeight="800" fill="#fff" fontFamily="Arial, sans-serif" letterSpacing="1">TR</text>
      <text x="139" y="84" textAnchor="middle" fontSize="50" fontWeight="800" fill="#fff" fontFamily="Arial, sans-serif">A</text>
      <line x1="120" y1="86" x2="150" y2="58" stroke={GOLD} strokeWidth="4.5" strokeLinecap="round" />
      <text x="100" y="103" textAnchor="middle" fontSize="9.6" fill="#fff" fontFamily="Arial, sans-serif" letterSpacing="1.2">TOTAL RECOVERYTATION ABE</text>
      <polyline points="52,119 79,119 85,110 91,130 97,113 103,119 148,119" fill="none" stroke={GOLD} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
      <text x="100" y="141" textAnchor="middle" fontSize="16.5" fontWeight="700" fill={GOLD} fontFamily="Arial, sans-serif" letterSpacing="2.5">ABESEKKOTSUIN</text>
      <text x="100" y="162" textAnchor="middle" fontSize="17" fontWeight="700" fill="#fff" letterSpacing="4">阿部接骨院</text>
      <text x="100" y="179" textAnchor="middle" fontSize="10" fill={GOLD} letterSpacing="3">大阪茨木</text>
    </svg>
  );
}

// ローディング画面：ロゴをくるくる回す。logoUrl があればその画像、無ければバッジ。
export function TraLoading({
  label = "読み込み中…",
  logoUrl,
  size = 120,
}: {
  label?: string;
  logoUrl?: string | null;
  size?: number;
}) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-5 p-8 text-center [perspective:800px]">
      <div className="tra-coin" style={{ width: size, height: size }}>
        {/* 表：ロゴ */}
        <div className="tra-face">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={logoUrl}
              alt="Total Recoverytation Abe"
              className="h-full w-full rounded-full object-cover"
            />
          ) : (
            <TraBadge size={size} />
          )}
        </div>
        {/* 裏：白 */}
        <div className="tra-face tra-back" />
      </div>
      <p className="text-sm text-slate-500">{label}</p>
    </div>
  );
}
