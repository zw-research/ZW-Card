"use client";

import Link from "next/link";
import { ALL_CARDS, CATEGORIES, cardHref, usesCard, type Category } from "../cards";
import { readingStore, useStore } from "../store";
import { BAND, BAND_INNER, FOCUS, PageHeading, TONES } from "../ui";

// 寬螢幕分兩欄：左欄是主星、輔星、長生，右欄是雙星組合
const LEFT_COLUMN = ["main", "minor", "stage"];
const COLUMNS = [
  CATEGORIES.filter((category) => LEFT_COLUMN.includes(category.id)),
  CATEGORIES.filter((category) => !LEFT_COLUMN.includes(category.id)),
];

function CategorySection({
  category,
  counts,
}: {
  category: Category;
  counts: Map<string, number>;
}) {
  const tone = TONES[category.tone];
  return (
    <section className={`overflow-hidden rounded-2xl border bg-paper-light ${tone.frame}`}>
      {/* 區塊標題用該分類的淡色當底 */}
      <header
        className={`flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-4 sm:px-6 ${tone.band}`}
      >
        <h2 className={`text-lg font-medium tracking-[0.12em] ${tone.text}`}>
          {category.name}
        </h2>
        <p className="text-sm text-ink-soft">{category.hint}</p>
      </header>

      <div className="flex flex-col gap-4 p-5 sm:p-6">
        {category.groups.map((group) => (
          <div key={group.name}>
            {category.groups.length > 1 && (
              <h3 className="mb-2 flex items-center gap-2 text-sm tracking-[0.12em] text-ink-soft">
                <span aria-hidden className={`h-1.5 w-1.5 rotate-45 ${tone.dot}`} />
                {group.name}
              </h3>
            )}
            <div className="flex flex-wrap gap-2">
              {group.cards.map((name) => {
                const count = counts.get(name) ?? 0;
                return (
                  <Link
                    key={name}
                    href={cardHref(name)}
                    className={`flex items-center gap-2 rounded-full border border-transparent px-4 py-2 tracking-[0.15em] transition-colors ${FOCUS} ${tone.chip}`}
                  >
                    {name}
                    {count > 0 && (
                      <span
                        title={`出現在 ${count} 個問題`}
                        className={`min-w-5 rounded-full px-1 text-center text-xs leading-5 tracking-normal text-paper-light ${tone.dot}`}
                      >
                        {count}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function CardIndex() {
  const readings = useStore(readingStore);
  // 每張牌卡出現在幾個問題裡
  const counts = new Map(
    ALL_CARDS.map((name) => [
      name,
      readings.filter((reading) => usesCard(reading, name)).length,
    ]),
  );

  return (
    <main className="flex flex-1 flex-col">
      <PageHeading en="Cards" zh="星曜連結" note="點選星曜，找出用到它的問題" />

      <div className={BAND}>
        <div className={BAND_INNER}>
          <div className="grid items-start gap-6 lg:grid-cols-2">
            {COLUMNS.map((column, index) => (
              <div key={index} className="flex flex-col gap-6">
                {column.map((category) => (
                  <CategorySection key={category.id} category={category} counts={counts} />
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
