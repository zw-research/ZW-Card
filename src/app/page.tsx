"use client";

import dynamic from "next/dynamic";

// 命盤、牌陣、取數、取卦都只在瀏覽器裡算（出生資料與牌陣存在這台瀏覽器），不做伺服器預先產生
const WebApp = dynamic(() => import("../zw/webApp"), {
  ssr: false,
  loading: () => <p className="px-4 py-10 text-center text-sm text-ink-soft">載入中…</p>,
});

export default function Home() {
  return <WebApp />;
}
