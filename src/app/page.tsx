"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { CARD_CATEGORY, SLOTS } from "./cards";
import { ReadingForm } from "./reading-form";
import {
  deleteImages,
  formatDate,
  readingStore,
  useStore,
  useToday,
  type Reading,
} from "./store";
import {
  ArrowCircle,
  BAND,
  BAND_INNER,
  BUTTON_PRIMARY,
  FOCUS,
  HOME_EVENT,
  INPUT,
  PANEL,
  PageHeading,
  ReadingItem,
  TONES,
} from "./ui";

// 網址 # 後面的紀錄 id；星曜連結頁的問題連結會帶著它過來
function subscribeHash(listener: () => void) {
  window.addEventListener("hashchange", listener);
  return () => window.removeEventListener("hashchange", listener);
}

function getHash() {
  return decodeURIComponent(window.location.hash.slice(1));
}

export default function Home() {
  const readings = useStore(readingStore);
  const hashId = useSyncExternalStore(subscribeHash, getHash, () => "");
  // 已經處理過、不再理會的網址 id（按了回首頁之後）
  const [dismissedHash, setDismissedHash] = useState("");
  const today = useToday();
  // 正在編輯的紀錄 id；"new" 表示新增
  const [editing, setEditing] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const editingReading = readings.find((reading) => reading.id === editing);
  const sorted = [...readings].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
  );
  // 優先順序：自己點選的 → 網址指定的 → 最新的一筆
  const linkedId = hashId !== dismissedHash ? hashId : "";
  const selected =
    sorted.find((reading) => reading.id === selectedId) ??
    sorted.find((reading) => reading.id === linkedId) ??
    sorted[0];

  const keyword = query.trim();
  const matches = keyword
    ? sorted.filter((reading) =>
        [
          reading.question,
          reading.analysis,
          reading.main,
          reading.minor,
          reading.stage,
          reading.date,
          formatDate(reading.date),
        ].some((value) => value.includes(keyword)),
      )
    : sorted;

  // 點頁首的標題或「每日三牌」時，回到最初的首頁：清掉搜尋與選取，顯示最新一筆
  useEffect(() => {
    const reset = () => {
      setSelectedId(null);
      setDismissedHash(getHash());
      setQuery("");
      window.scrollTo({ top: 0 });
    };
    window.addEventListener(HOME_EVENT, reset);
    return () => window.removeEventListener(HOME_EVENT, reset);
  }, []);

  function openForm(id: string) {
    setEditing(id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function save(reading: Reading) {
    readingStore.save(
      editingReading
        ? readings.map((item) => (item.id === reading.id ? reading : item))
        : [...readings, reading],
    );
    setSelectedId(reading.id);
    setEditing(null);
  }

  function remove(reading: Reading) {
    if (!window.confirm(`確定刪除「${reading.question}」這筆紀錄？`)) return;
    deleteImages(reading.imageIds);
    readingStore.save(readings.filter((item) => item.id !== reading.id));
    if (editing === reading.id) setEditing(null);
  }

  return (
    <main className="flex flex-1 flex-col">
      <PageHeading en="Daily Reading">
        {!editing && (
          <button
            type="button"
            onClick={() => openForm("new")}
            className={BUTTON_PRIMARY}
          >
            新增問題
          </button>
        )}
      </PageHeading>

      <div className={BAND}>
        <div className={BAND_INNER}>
      {editing && (
        <ReadingForm
          key={editing}
          initial={editingReading}
          today={today}
          onSave={save}
          onCancel={() => setEditing(null)}
        />
      )}

      {!selected ? (
        !editing && (
          <p className={`${PANEL} px-6 py-12 text-center text-ink-soft`}>
            還沒有任何紀錄，按「新增問題」記下今天的問題與三張牌卡。
          </p>
        )
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
          {/* 舊有紀錄：點選後在右側顯示 */}
          <section className={`${PANEL} flex flex-col gap-3 p-5`}>
            <h2 className="text-lg font-medium tracking-[0.12em]">
              舊有紀錄
              <span className="ml-2 text-sm font-normal tracking-normal text-ink-soft">
                {keyword ? `${matches.length} / ${sorted.length}` : sorted.length} 筆
              </span>
            </h2>
            <label htmlFor="reading-search" className="sr-only">
              搜尋紀錄
            </label>
            <input
              id="reading-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜尋問題、牌卡或日期…"
              className={INPUT}
            />
            {matches.length === 0 ? (
              <p className="py-6 text-center text-ink-soft">找不到符合的紀錄。</p>
            ) : (
              <ul className="-mx-2 flex max-h-72 flex-col gap-1 overflow-y-auto px-2 py-1 lg:max-h-[34rem]">
                {matches.map((reading) => {
                  const active = reading.id === selected.id;
                  return (
                    <li key={reading.id}>
                      <button
                        type="button"
                        aria-pressed={active}
                        onClick={() => setSelectedId(reading.id)}
                        className={`flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors ${FOCUS} ${
                          active
                            ? "border-ink bg-paper"
                            : "border-transparent hover:bg-paper"
                        }`}
                      >
                        <span className="flex min-w-0 flex-1 flex-col gap-1">
                        <span className="text-xs tracking-widest text-ink-soft">
                          {formatDate(reading.date)}
                        </span>
                        <span className="truncate font-medium">{reading.question}</span>
                        <span className="flex flex-wrap gap-1 text-xs">
                          {SLOTS.map((slot) => {
                            const name = reading[slot.key];
                            const owner = CARD_CATEGORY.get(name);
                            return (
                              <span
                                key={slot.key}
                                className={`rounded-full px-2 py-0.5 ${
                                  owner ? TONES[owner.tone].chip : "bg-paper"
                                }`}
                              >
                                {name}
                                {reading.reversed?.[slot.key] ? "倒" : "正"}
                              </span>
                            );
                          })}
                        </span>
                        </span>
                        <ArrowCircle />
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <ReadingItem
            reading={selected}
            onEdit={() => openForm(selected.id)}
            onDelete={() => remove(selected)}
          />
        </div>
      )}
        </div>
      </div>
    </main>
  );
}
