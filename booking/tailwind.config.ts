import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // 担当者カラー（管理画面カード／患者画面のアクセント）
        staff: {
          abe: "#2563eb", // 阿部：青
          shibuya: "#16a34a", // 澁谷：緑
          hagiwara: "#7c3aed", // 萩原：紫
          hayashi: "#ea580c", // 林：オレンジ
          off: "#9ca3af", // 休み：グレー
        },
      },
    },
  },
  plugins: [],
};

export default config;
