"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { CARD_CATEGORY, SLOTS, cardHref, type Tone } from "./cards";
import { formatDate, loadImage, type Reading } from "./store";

export const TONES: Record<
  Tone,
  {
    chip: string;
    active: string;
    tile: string;
    text: string;
    border: string;
    dot: string;
    // 區塊外框與標題帶的底色
    frame: string;
    band: string;
  }
> = {
  taupe: {
    chip: "bg-taupe-soft hover:border-taupe",
    active: "bg-taupe-deep text-paper-light border-taupe-deep",
    tile: "border-taupe/50 bg-taupe-soft/60 hover:bg-taupe-soft",
    text: "text-taupe-deep",
    border: "border-taupe",
    dot: "bg-taupe-deep",
    frame: "border-taupe/40",
    band: "bg-taupe-soft",
  },
  mist: {
    chip: "bg-mist-soft hover:border-mist",
    active: "bg-mist-deep text-paper-light border-mist-deep",
    tile: "border-mist/50 bg-mist-soft/60 hover:bg-mist-soft",
    text: "text-mist-deep",
    border: "border-mist",
    dot: "bg-mist-deep",
    frame: "border-mist/40",
    band: "bg-mist-soft",
  },
  gold: {
    chip: "bg-gold-soft hover:border-gold",
    active: "bg-gold-deep text-paper-light border-gold-deep",
    tile: "border-gold/50 bg-gold-soft/60 hover:bg-gold-soft",
    text: "text-gold-deep",
    border: "border-gold",
    dot: "bg-gold-deep",
    frame: "border-gold/40",
    band: "bg-gold-soft",
  },
  apricot: {
    chip: "bg-apricot-soft hover:border-apricot",
    active: "bg-apricot-deep text-paper-light border-apricot-deep",
    tile: "border-apricot/50 bg-apricot-soft/60 hover:bg-apricot-soft",
    text: "text-apricot-deep",
    border: "border-apricot",
    dot: "bg-apricot-deep",
    frame: "border-apricot/40",
    band: "bg-apricot-soft",
  },
};

export const PANEL = "border border-line bg-paper-light";
export const FOCUS =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";
export const INPUT = `rounded-lg border border-line bg-paper-light px-4 py-2.5 placeholder:text-ink-soft/70 ${FOCUS}`;
export const BUTTON_PRIMARY = `rounded-full bg-ink px-7 py-2.5 text-sm font-medium tracking-[0.12em] text-paper-light transition-opacity hover:opacity-85 disabled:opacity-40 ${FOCUS}`;
export const BUTTON_GHOST = `rounded-full bg-paper px-6 py-2.5 text-sm tracking-[0.12em] transition-colors hover:bg-line disabled:opacity-40 ${FOCUS}`;
// 白底標題區下方的米色內容帶
export const BAND = "flex-1 bg-paper";
export const BAND_INNER =
  "mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-12 sm:px-6";

// 頁面標題：大大的英文字、手繪細線，下方可選擇加上紅點與中文標題
export function PageHeading({
  en,
  zh,
  note,
  compact = false,
  children,
}: {
  en: string;
  zh?: string;
  note?: string;
  // 高度減半的版本，內容為主的頁面用
  compact?: boolean;
  children?: React.ReactNode;
}) {
  const title = compact ? "text-2xl sm:text-3xl" : "text-4xl sm:text-5xl";
  return (
    <section
      className={`relative overflow-hidden px-4 text-center ${compact ? "pt-6 pb-5" : "pt-16 pb-14"}`}
    >
      {/* 左右兩側的色塊與細線，只在寬螢幕出現 */}
      <svg
        aria-hidden
        viewBox="0 0 320 260"
        className={`pointer-events-none absolute top-0 hidden lg:block ${compact ? "-left-8 h-32" : "-left-16 h-64"}`}
      >
        <path
          className="fill-haze"
          d="M96 40C128 20 168 34 170 70C172 104 140 122 110 116C80 110 70 60 96 40Z"
        />
        <path
          className="fill-paper"
          d="M60 96C100 50 200 44 244 96C286 146 250 214 180 226C110 238 20 200 22 150C23 128 40 118 60 96Z"
        />
        <path
          className="stroke-ink/50"
          fill="none"
          strokeWidth="1"
          strokeLinecap="round"
          d="M20 232C60 190 76 170 70 196C66 214 92 196 110 178C100 204 120 204 150 182C170 168 190 150 214 138"
        />
      </svg>
      <svg
        aria-hidden
        viewBox="0 0 200 200"
        className={`pointer-events-none absolute bottom-0 hidden lg:block ${compact ? "-right-5 h-24" : "-right-10 h-44"}`}
      >
        <path
          className="fill-paper"
          d="M40 70C70 30 150 30 172 80C192 126 150 176 100 172C50 168 16 110 40 70Z"
        />
        <path
          className="fill-haze"
          d="M120 36C140 24 164 34 166 56C168 78 146 90 128 84C110 78 104 46 120 36Z"
        />
      </svg>

      <div className="relative mx-auto w-fit">
        <svg
          aria-hidden
          viewBox="0 0 120 60"
          className={`pointer-events-none absolute ${compact ? "-top-3 -right-9 h-8 w-16" : "-top-6 -right-16 h-14 w-28"}`}
          fill="none"
        >
          <path
            className="stroke-ink/50"
            strokeWidth="0.8"
            strokeLinecap="round"
            d="M8 46C30 22 78 4 104 10C122 15 96 34 62 42C40 47 30 42 44 34"
          />
        </svg>
        {zh ? (
          <>
            <p aria-hidden className={`font-display ${title}`}>
              {en}
            </p>
            <h1 className={`flex items-center justify-center gap-2 text-sm font-medium tracking-[0.12em] ${compact ? "mt-1.5" : "mt-4"}`}>
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-gold" />
              {zh}
            </h1>
          </>
        ) : (
          <h1 className={`font-display ${title}`}>{en}</h1>
        )}
      </div>
      {note && (
        <p className={`relative text-sm text-ink-soft ${compact ? "mt-1" : "mt-3"}`}>{note}</p>
      )}
      {children && <div className="relative mt-7">{children}</div>}
    </section>
  );
}

// 圓圈箭頭
export function ArrowCircle() {
  return (
    <span
      aria-hidden
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-ink/50"
    >
      <svg viewBox="0 0 12 12" className="h-3 w-3" fill="none">
        <path
          className="stroke-ink"
          strokeWidth="1"
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M1.5 6H10M7 3L10 6L7 9"
        />
      </svg>
    </span>
  );
}

// 已經在首頁時，連結本身不會重置畫面，所以另外發事件讓首頁回到初始狀態
export const HOME_EVENT = "practice1:home";

export function HomeLink({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href="/"
      className={className}
      onClick={() => window.dispatchEvent(new Event(HOME_EVENT))}
    >
      {children}
    </Link>
  );
}

// 一張牌卡，點下去連到該牌卡的星曜連結頁
export function CardTile({
  label,
  name,
  reversed = false,
}: {
  label: string;
  name: string;
  reversed?: boolean;
}) {
  const owner = CARD_CATEGORY.get(name);
  const tone = owner ? TONES[owner.tone] : undefined;
  return (
    <Link
      href={cardHref(name)}
      title={label}
      className={`flex items-center gap-3 rounded-full border px-5 py-2 whitespace-nowrap transition-colors ${FOCUS} ${
        tone?.tile ?? "border-line"
      }`}
    >
      <span className="sr-only">{label}：</span>
      <span className={`font-medium tracking-[0.12em] ${tone?.text ?? ""}`}>{name}</span>
      <span aria-hidden className="h-4 w-px bg-ink/30" />
      <span className={reversed ? "font-medium text-gold-deep" : "text-ink-soft"}>
        {reversed ? "倒" : "正"}
        <span className="sr-only">位</span>
      </span>
    </Link>
  );
}

export function StoredImage({ id, alt }: { id: string; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    let created: string | null = null;
    loadImage(id)
      .then((blob) => {
        if (!alive || !blob) return;
        created = URL.createObjectURL(blob);
        setUrl(created);
      })
      .catch(() => {});
    return () => {
      alive = false;
      if (created) URL.revokeObjectURL(created);
    };
  }, [id]);

  if (!url) {
    return <span className="block h-24 w-24 rounded-xl border border-line bg-paper" />;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={`block rounded-xl ${FOCUS}`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- 來源是瀏覽器內的 blob 網址 */}
      <img
        src={url}
        alt={alt}
        className="h-24 w-24 rounded-xl border border-line object-cover"
      />
    </a>
  );
}

export function ReadingItem({
  reading,
  onEdit,
  onDelete,
}: {
  reading: Reading;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <article className={`${PANEL} flex flex-col gap-4 p-5 sm:p-6`}>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm text-ink-soft">
        <span className="tracking-widest">{formatDate(reading.date)}</span>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className={`ml-auto hover:text-ink ${FOCUS}`}
          >
            編輯
          </button>
        )}
        {onDelete && (
          <button type="button" onClick={onDelete} className={`hover:text-danger ${FOCUS}`}>
            刪除
          </button>
        )}
      </div>

      <h3 className="text-xl leading-8 font-medium break-words">{reading.question}</h3>

      <div className="flex flex-wrap gap-3">
        {SLOTS.map((slot) => (
          <CardTile
            key={slot.key}
            label={slot.label}
            name={reading[slot.key]}
            reversed={reading.reversed?.[slot.key]}
          />
        ))}
      </div>

      <div>
        <h4 className="mb-1 text-sm tracking-[0.12em] text-ink-soft">整合解析</h4>
        {reading.analysis ? (
          <p className="leading-7 break-words whitespace-pre-wrap">{reading.analysis}</p>
        ) : (
          <p className="text-ink-soft">尚未寫下整合解析。</p>
        )}
      </div>

      {reading.imageIds.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {reading.imageIds.map((id, index) => (
            <StoredImage key={id} id={id} alt={`${reading.question} 附圖 ${index + 1}`} />
          ))}
        </div>
      )}
    </article>
  );
}
