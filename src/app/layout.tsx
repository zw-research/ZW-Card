import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "紫微命盤",
  description: "紫微斗數命盤、牌陣、取數、取卦",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="zh-Hant" className="h-full antialiased">
      <head>
        {/* next/font 在 Turbopack 建置時無法處理 Noto 的繁中字體，改用樣式表載入 */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font -- 放在根 layout，所有頁面都會套用 */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400&family=Noto+Sans+TC:wght@400;500&display=swap"
        />
      </head>
      <body className="min-h-full flex flex-col">
        <header>
          <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-5 sm:px-6">
            <Link
              href="/"
              className="flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink"
            >
              <svg aria-hidden viewBox="0 0 36 36" className="h-9 w-9">
                <circle cx="18" cy="18" r="16" className="fill-ink" />
                <circle cx="21" cy="15" r="8" className="fill-paper-light" />
                <circle cx="24" cy="12" r="4" className="fill-gold" />
              </svg>
              <span className="text-xl font-medium tracking-[0.12em]">紫微命盤</span>
              <span className="hidden font-display text-[10px] leading-tight tracking-[0.15em] sm:block">
                ZI WEI
                <br />
                CHART
              </span>
            </Link>
          </div>
          <p className="bg-paper px-4 py-2.5 text-center text-xs tracking-[0.12em] text-ink-soft">
            紫微斗數・命盤與牌卡
          </p>
        </header>
        {children}
      </body>
    </html>
  );
}
