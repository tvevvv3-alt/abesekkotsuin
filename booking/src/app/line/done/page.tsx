// LINE連携の結果表示（ログイン → コールバック後に遷移してくる）
const NAVY = "#0f1f40";
const GOLD = "#c9a24b";

const ERRORS: Record<string, string> = {
  notconfigured: "現在LINE連携は準備中です。お手数ですが後ほどお試しください。",
  noappt: "予約情報が見つかりませんでした。",
  cancel: "LINE連携がキャンセルされました。",
  badstate: "セッションの有効期限が切れました。もう一度お試しください。",
  token: "LINE認証に失敗しました。もう一度お試しください。",
  noid: "LINE情報の取得に失敗しました。",
  decode: "LINE情報の解析に失敗しました。",
  nouser: "LINEユーザー情報を取得できませんでした。",
  server: "サーバー設定が未完了です。",
};

export default function LineDonePage({
  searchParams,
}: {
  searchParams: { ok?: string; error?: string };
}) {
  const ok = searchParams.ok === "1";
  const errMsg = searchParams.error ? ERRORS[searchParams.error] || "エラーが発生しました。" : null;

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center bg-slate-50 px-8 text-center">
      {ok ? (
        <>
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100 text-3xl text-green-600">
            ✓
          </div>
          <h1 className="text-lg font-bold text-slate-800">
            ご予約・LINE連携が完了しました
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            予約確認のメッセージをLINEにお送りしました。
            <br />
            前日・当日のリマインドや問診票のご案内もLINEでお届けします。
          </p>
        </>
      ) : (
        <>
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-3xl text-amber-600">
            !
          </div>
          <h1 className="text-lg font-bold text-slate-800">
            ご予約は完了しています
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            {errMsg}
            <br />
            <span className="text-xs text-slate-400">
              ※ ご予約自体はお済みです。LINEでの確認・リマインドをご希望の場合は、
              お手数ですがもう一度ご予約完了画面からお試しください。
            </span>
          </p>
        </>
      )}
      <a
        href="/"
        className="mt-8 rounded-xl px-6 py-3 text-sm font-bold text-white"
        style={{ backgroundColor: NAVY, border: `1px solid ${GOLD}` }}
      >
        予約トップへ戻る
      </a>
    </div>
  );
}
