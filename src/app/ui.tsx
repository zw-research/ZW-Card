// 共用的樣式與頁面標題

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
