import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { HomeLink } from "./ui";

export const metadata: Metadata = {
  title: "每日牌卡討論",
  description: "紫微斗數每日牌卡的討論札記",
};

const NAV_PILL =
  "rounded-full px-5 py-2.5 text-sm tracking-[0.12em] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

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
            <HomeLink className="flex items-center gap-3 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ink">
              <svg aria-hidden viewBox="0 0 36 36" className="h-9 w-9">
                <circle cx="18" cy="18" r="16" className="fill-ink" />
                <circle cx="21" cy="15" r="8" className="fill-paper-light" />
                <circle cx="24" cy="12" r="4" className="fill-gold" />
              </svg>
              <span className="text-xl font-medium tracking-[0.12em]">每日牌卡討論</span>
              <span className="hidden font-display text-[10px] leading-tight tracking-[0.15em] sm:block">
                DAILY CARD
                <br />
                NOTES
              </span>
            </HomeLink>
            <nav aria-label="主選單" className="flex gap-3">
              <HomeLink className={`${NAV_PILL} bg-paper hover:bg-line`}>每日三牌</HomeLink>
              <Link href="/chart" className={`${NAV_PILL} bg-paper hover:bg-line`}>
                命盤
              </Link>
              <Link href="/card" className={`${NAV_PILL} bg-paper hover:bg-line`}>
                單星補充
              </Link>
              <Link href="/backup" className={`${NAV_PILL} bg-paper hover:bg-line`}>
                備份
              </Link>
            </nav>
          </div>
          <p className="bg-paper px-4 py-2.5 text-center text-xs tracking-[0.12em] text-ink-soft">
            紫微斗數・主星、輔星、長生的每日三牌札記
          </p>
        </header>
        {children}
      </body>
    </html>
  );
}
