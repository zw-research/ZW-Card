import type { ReactNode, MouseEventHandler } from "react";
// 獨立頁面裡沒有牌卡頁可以連，星名只顯示文字
export default function Link({ children, className }: { href?: unknown; title?: string; children?: ReactNode; className?: string; onClick?: MouseEventHandler }) {
  return <span className={className}>{children}</span>;
}
