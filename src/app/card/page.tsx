"use client";

import Link from "next/link";
import { CATEGORIES, cardHref } from "../cards";
import { noteStore, useStore } from "../store";
import { BAND, BAND_INNER, FOCUS, PANEL, PageHeading, TONES } from "../ui";

export default function CardIndex() {
  const notes = useStore(noteStore);
  const counts = new Map<string, number>();
  for (const note of notes) {
    counts.set(note.card, (counts.get(note.card) ?? 0) + 1);
  }

  return (
    <main className="flex flex-1 flex-col">
      <PageHeading en="Cards" zh="單星補充" note="點選牌卡，查看或加入補充事項" />

      <div className={BAND}>
      <div className={BAND_INNER}>
      <div className="grid items-start gap-6 lg:grid-cols-2">
        {CATEGORIES.map((category) => {
          const tone = TONES[category.tone];
          return (
            <section key={category.id} className={`${PANEL} p-5 sm:p-6`}>
              <h2 className={`text-lg font-medium tracking-[0.12em] ${tone.text}`}>
                {category.name}
              </h2>
              <p className="mt-1 text-sm text-ink-soft">{category.hint}</p>

              <div className="mt-4 flex flex-col gap-4">
                {category.groups.map((group) => (
                  <div key={group.name}>
                    {category.groups.length > 1 && (
                      <h3 className="mb-2 flex items-center gap-2 text-sm tracking-[0.12em] text-ink-soft">
                        <span
                          aria-hidden
                          className={`h-1.5 w-1.5 rotate-45 ${tone.dot}`}
                        />
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
                                title={`補充事項 ${count} 則`}
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
        })}
      </div>
      </div>
      </div>
    </main>
  );
}
