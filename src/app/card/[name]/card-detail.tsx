"use client";

import Link from "next/link";
import { useState } from "react";
import { CARD_CATEGORY, cardHref, relatedCards } from "../../cards";
import {
  formatDate,
  noteStore,
  readingStore,
  stamp,
  useStore,
  useToday,
} from "../../store";
import {
  BAND,
  BAND_INNER,
  BUTTON_PRIMARY,
  FOCUS,
  INPUT,
  PANEL,
  ReadingItem,
  TONES,
} from "../../ui";

export function CardDetail({ name }: { name: string }) {
  const notes = useStore(noteStore);
  const readings = useStore(readingStore);
  const today = useToday();
  const [text, setText] = useState("");

  const category = CARD_CATEGORY.get(name);
  if (!category) return null;
  const tone = TONES[category.tone];
  const related = relatedCards(name);

  const cardNotes = notes
    .filter((note) => note.card === name)
    .sort((a, b) => b.createdAt - a.createdAt);
  // 單一主星也列出含有它的雙星紀錄
  const cardReadings = readings
    .filter(
      (reading) =>
        reading.main === name ||
        reading.minor === name ||
        reading.stage === name ||
        (category.id === "main" && reading.main.includes(name)),
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);

  function addNote() {
    const trimmed = text.trim();
    if (!trimmed || !today) return;
    noteStore.save([...notes, { ...stamp(), date: today, card: name, text: trimmed }]);
    setText("");
  }

  function removeNote(id: string) {
    if (!window.confirm("確定刪除這則補充事項？")) return;
    noteStore.save(notes.filter((note) => note.id !== id));
  }

  return (
    <main className="flex flex-1 flex-col">
      <div className="px-4 pt-10 pb-12 text-center">
        <Link
          href="/card"
          className={`text-sm tracking-widest text-ink-soft hover:text-ink ${FOCUS}`}
        >
          ← 單星補充
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
      <div className="grid items-start gap-6 lg:grid-cols-2">
        <section className={`${PANEL} p-5 sm:p-6`}>
          <h2 className="text-lg font-medium tracking-[0.12em]">補充事項</h2>
          <form
            className="mt-3 flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              addNote();
            }}
          >
            <label htmlFor="note" className="sr-only">
              補充事項
            </label>
            <textarea
              id="note"
              rows={4}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
                  event.currentTarget.form?.requestSubmit();
                }
              }}
              placeholder={`寫下對「${name}」的補充事項…`}
              className={`${INPUT} resize-y leading-7`}
            />
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-ink-soft">Ctrl + Enter 可直接加入</span>
              <button type="submit" disabled={!text.trim()} className={BUTTON_PRIMARY}>
                加入
              </button>
            </div>
          </form>

          {cardNotes.length === 0 ? (
            <p className="mt-6 text-center text-ink-soft">還沒有補充事項。</p>
          ) : (
            <ul className="mt-5 flex flex-col gap-4">
              {cardNotes.map((note) => (
                <li key={note.id} className={`border-l-2 pl-3 ${tone.border}`}>
                  <div className="flex items-baseline justify-between gap-2 text-sm text-ink-soft">
                    <span>{formatDate(note.date)}</span>
                    <button
                      type="button"
                      onClick={() => removeNote(note.id)}
                      className={`hover:text-danger ${FOCUS}`}
                    >
                      刪除
                    </button>
                  </div>
                  <p className="mt-1 leading-7 break-words whitespace-pre-wrap">
                    {note.text}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <h2 className="text-lg font-medium tracking-[0.12em]">
            出現過的三牌紀錄
            <span className="ml-2 text-sm font-normal tracking-normal text-ink-soft">
              {cardReadings.length} 筆
            </span>
          </h2>
          {cardReadings.length === 0 ? (
            <p className={`${PANEL} px-6 py-10 text-center text-ink-soft`}>
              這張牌卡還沒有出現在三牌紀錄中。
            </p>
          ) : (
            cardReadings.map((reading) => (
              <ReadingItem key={reading.id} reading={reading} />
            ))
          )}
        </section>
      </div>
      </div>
      </div>
    </main>
  );
}
