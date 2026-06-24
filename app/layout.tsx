import type { Metadata, Viewport } from "next";
import "./globals.css";

const SITE_URL =
  process.env.NEXT_PUBLIC_SITE_URL ?? "https://trailerflow.example";
const TITLE = "TrailerFlow";
const DESCRIPTION = "映画館の予告編タイムを、ずっと。";
const LONG_DESCRIPTION =
  "探さなくていい。次の観たい一本が流れてくる。映画館で本編前に流れる予告編タイムを、Web 上でずっと楽しめるサービス。";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${TITLE} — ${DESCRIPTION}`,
    template: `%s — ${TITLE}`,
  },
  description: LONG_DESCRIPTION,
  applicationName: TITLE,
  openGraph: {
    type: "website",
    siteName: TITLE,
    title: `${TITLE} — ${DESCRIPTION}`,
    description: LONG_DESCRIPTION,
    url: SITE_URL,
    locale: "ja_JP",
  },
  twitter: {
    card: "summary_large_image",
    title: `${TITLE} — ${DESCRIPTION}`,
    description: LONG_DESCRIPTION,
  },
};

export const viewport: Viewport = {
  themeColor: "#0a0a0b",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-lobby-bg text-white">{children}</body>
    </html>
  );
}
