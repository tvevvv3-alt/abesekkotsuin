import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "阿部家カレンダー",
  description: "家族の予定と献立をいっしょに管理",
  appleWebApp: { capable: true, title: "阿部家", statusBarStyle: "default" },
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-dvh font-sans antialiased">
        <div className="mx-auto max-w-xl">{children}</div>
      </body>
    </html>
  );
}
