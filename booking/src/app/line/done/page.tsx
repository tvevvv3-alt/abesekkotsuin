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
          <h1 className="text-lg font-bold text-slate-800">LINE連携が完了しました</h1>
          <p className="mt-2 text-sm text-slate-600">
            予約確認のメッセージをLINEにお送りしました。
            <br />
            前日・当日にリマインドもお届けします。
          </p>
        </>
      ) : (
        <>
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100 text-3xl text-amber-600">
            !
          </div>
          <h1 className="text-lg font-bold text-slate-800">LINE連携</h1>
          <p className="mt-2 text-sm text-slate-600">{errMsg}</p>
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
