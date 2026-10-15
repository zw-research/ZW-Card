import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  // 開發時讓同一個熱點／區域網路上的手機也能載入頁面的程式，否則頁面打得開但按鈕沒反應
  allowedDevOrigins: ["172.20.10.*"],
  cacheComponents: true,
  // 每日三牌、星曜連結、備份已經拿掉，舊網址一律帶回首頁的命盤
  redirects() {
    return [
      { source: "/chart", destination: "/", permanent: false },
      { source: "/card/:path*", destination: "/", permanent: false },
      { source: "/backup", destination: "/", permanent: false },
    ];
  },
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
