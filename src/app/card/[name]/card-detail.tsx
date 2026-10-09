"use client";

import Link from "next/link";
import { CARD_CATEGORY, SLOTS, cardHref, relatedCards, usesCard } from "../../cards";
import { formatDate, readingStore, useStore } from "../../store";
import { ArrowCircle, BAND, BAND_INNER, FOCUS, PANEL, TONES } from "../../ui";

// 一顆星曜的頁面：列出用到它的問題，點問題回到首頁看那一筆
export function CardDetail({ name }: { name: string }) {
  const readings = useStore(readingStore);

  const category = CARD_CATEGORY.get(name);
  if (!category) return null;
  const tone = TONES[category.tone];
  const related = relatedCards(name);

  const cardReadings = readings
    .filter((reading) => usesCard(reading, name))
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

  return (
    <main className="flex flex-1 flex-col">
      <div className="px-4 pt-10 pb-12 text-center">
        <Link
          href="/card"
          className={`text-sm tracking-widest text-ink-soft hover:text-ink ${FOCUS}`}
        >
          ← 星曜連結
        </Link>
        <h1 className={`mt-6 text-4xl tracking-[0.12em] sm:text-5xl ${tone.text}`}>{name}</h1>
        <p className="mt-4 flex items-center justify-center gap-2 text-sm font-medium tracking-[0.12em]">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold" />
          {category.name}
        </p>
        {related.length > 0 && (
          <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
            <span className="text-sm tracking-widest text-ink-soft">
              {category.id === "pair" ? "組成單星" : "相關雙星"}
            </span>
            {related.map((card) => {
              const owner = CARD_CATEGORY.get(card);
              return (
                <Link
                  key={card}
                  href={cardHref(card)}
                  className={`rounded-full border border-transparent px-4 py-1 tracking-[0.15em] transition-colors ${FOCUS} ${
                    owner ? TONES[owner.tone].chip : ""
                  }`}
                >
                  {card}
                </Link>
              );
            })}
          </div>
        )}
      </div>

      <div className={BAND}>
        <div className={BAND_INNER}>
          <h2 className="text-lg font-medium tracking-[0.12em]">
            用到這顆星的問題
            <span className="ml-2 text-sm font-normal tracking-normal text-ink-soft">
              {cardReadings.length} 題
            </span>
          </h2>
          {cardReadings.length === 0 ? (
            <p className={`${PANEL} px-6 py-10 text-center text-ink-soft`}>
              還沒有用到「{name}」的問題。
            </p>
          ) : (
            <ul className={`${PANEL} flex flex-col p-2`}>
              {cardReadings.map((reading) => (
                <li key={reading.id} className="border-b border-line last:border-b-0">
                  <Link
                    href={`/#${encodeURIComponent(reading.id)}`}
                    className={`flex items-center gap-3 rounded-xl px-3 py-3 transition-colors hover:bg-paper ${FOCUS}`}
                  >
                    <span className="flex min-w-0 flex-1 flex-col gap-1">
                      <span className="text-xs tracking-widest text-ink-soft">
                        {formatDate(reading.date)}
                      </span>
                      <span className="font-medium break-words">{reading.question}</span>
                      <span className="flex flex-wrap gap-1 text-xs">
                        {SLOTS.map((slot) => {
                          const card = reading[slot.key];
                          const owner = CARD_CATEGORY.get(card);
                          return (
                            <span
                              key={slot.key}
                              className={`rounded-full px-2 py-0.5 ${
                                owner ? TONES[owner.tone].chip : "bg-paper"
                              }`}
                            >
                              {card}
                              {reading.reversed?.[slot.key] ? "倒" : "正"}
                            </span>
                          );
                        })}
                      </span>
                    </span>
                    <ArrowCircle />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
