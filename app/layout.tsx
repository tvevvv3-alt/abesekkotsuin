import type { Metadata } from "next";
import { Noto_Serif_JP, Noto_Sans_JP, Bebas_Neue } from "next/font/google";
import "./globals.css";

const notoSerif = Noto_Serif_JP({
  subsets: ["latin"],
  weight: ["300", "400", "700", "900"],
  variable: "--font-noto-serif",
  display: "swap",
});

const notoSans = Noto_Sans_JP({
  subsets: ["latin"],
  weight: ["300", "400", "500"],
  variable: "--font-noto-sans",
  display: "swap",
});

const bebas = Bebas_Neue({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-bebas",
  display: "swap",
});

export const metadata: Metadata = {
  title: "阿部接骨院 | スポーツの痛みに、本気で向き合う。| 茨木・川西",
  description:
    "どこへ行っても変わらなかった痛みに、根本から向き合う。大阪府茨木市・完全予約制スポーツ整骨院。",
  openGraph: {
    title: "阿部接骨院 | スポーツの痛みに、本気で向き合う。",
    description:
      "どこへ行っても変わらなかった痛みに、根本から向き合う。大阪府茨木市・完全予約制スポーツ整骨院。",
    locale: "ja_JP",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja" className={`${notoSerif.variable} ${notoSans.variable} ${bebas.variable}`}>
      <body className="font-sans grain">{children}</body>
    </html>
  );
}
