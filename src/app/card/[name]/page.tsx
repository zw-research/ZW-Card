import { notFound } from "next/navigation";
import { Suspense } from "react";
import { CARD_CATEGORY } from "../../cards";
import { BAND } from "../../ui";
import { CardDetail } from "./card-detail";

// 這個專案開了 Cache Components，不能用 dynamicParams = false；
// 改用 ensureStatic 要求整頁都是建置時產生的靜態內容。清單以外的名稱由下面的 notFound() 回 404。
export const ensureStatic = "navigation";

// 建置時為每一顆星曜預先產生頁面
export function generateStaticParams() {
  return [...CARD_CATEGORY.keys()].map((name) => ({ name }));
}

export default function CardPage({ params }: PageProps<"/card/[name]">) {
  // 讀網址參數的部分放在 Suspense 裡，切換到這一頁時外框可以立刻出現
  return (
    <Suspense fallback={<CardFallback />}>
      <Card params={params} />
    </Suspense>
  );
}

async function Card({ params }: Pick<PageProps<"/card/[name]">, "params">) {
  const { name: rawName } = await params;
  const name = decodeName(rawName);
  if (!CARD_CATEGORY.has(name)) notFound();

  return <CardDetail name={name} />;
}

// 星曜名稱還沒解析出來時的版面骨架
function CardFallback() {
  return (
    <main className="flex flex-1 flex-col">
      <div className="h-64" />
      <div className={BAND} />
    </main>
  );
}

function decodeName(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
