import { notFound } from "next/navigation";
import { ALL_CARDS, CARD_CATEGORY } from "../../cards";
import { CardDetail } from "./card-detail";

export function generateStaticParams() {
  return ALL_CARDS.map((name) => ({ name }));
}

export default async function CardPage({ params }: PageProps<"/card/[name]">) {
  const { name: rawName } = await params;
  const name = decodeName(rawName);
  if (!CARD_CATEGORY.has(name)) notFound();

  return <CardDetail name={name} />;
}

function decodeName(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
