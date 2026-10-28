import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cardFull, cardThumb } from "./cardImages";
import { FOCUS } from "./ui";

// 牌陣的牌卡圖（2026/10/28）：
// 1. 文字盤點牌 → CardZoom 跳出整張大圖（倒牌圖轉 180 度），可順手點選這宮看飛化
// 2. 「圖卡」→ CardGallery 全螢幕小圖盤：牌吃滿畫面、不畫框；宮名寫在中央留白（四角的宮卡在中央四個角），
//    命宮實心深色字塊、三方四正杏色字；點牌在空白處（直拿在下方、橫拿在右邊）看大圖

type Card = { name: string; reversed: boolean };
type Cell = { palace: string; branch: string; main: Card; minor: Card };

const POS: Record<string, [number, number]> = {
  巳: [1, 1], 午: [1, 2], 未: [1, 3], 申: [1, 4], 辰: [2, 1], 酉: [2, 4], 卯: [3, 1], 戌: [3, 4], 寅: [4, 1], 丑: [4, 2], 子: [4, 3], 亥: [4, 4],
};
// 宮名在中央留白的位置（中央區塊內的百分比）：四角的宮在四個角，邊上的宮平均分布在 1/3、2/3 處（2026/10/28 皐月選平均分布）
const LABEL_AT: Record<string, [number, number]> = {
  巳: [0, 0], 申: [100, 0], 寅: [0, 100], 亥: [100, 100], 午: [33.33, 0], 未: [66.67, 0], 丑: [33.33, 100], 子: [66.67, 100], 辰: [0, 33.33], 卯: [0, 66.67], 酉: [100, 33.33], 戌: [100, 66.67],
};
const SHORT: Record<string, string> = { 命宮: "命", 兄弟: "兄", 夫妻: "夫", 子女: "子", 財帛: "財", 疾厄: "疾", 遷移: "遷", 交友: "友", 官祿: "官", 田宅: "田", 福德: "福", 父母: "父" };
const SANFANG = ["財帛", "官祿", "遷移"];
const RATIO = 800 / 440; // 牌卡高寬比
const GAP = 2; // 宮與宮之間
const PAIR_GAP = 1; // 同宮兩張牌之間
const MARGIN = 18; // 中央兩張牌四周留給宮名的空白

const label = (c: Card) => `${c.name}（${c.reversed ? "倒" : "正"}）`;

// 文字盤點牌跳出的大圖
export function CardZoom({ card, palace, selected, onSelect, onClose }: { card: Card; palace?: string; selected?: boolean; onSelect?: () => void; onClose: () => void }) {
  const close = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    close.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [onClose]);
  const src = cardFull(card.name);
  return (
    <div
      role="dialog"
      aria-label={label(card)}
      onClick={(e) => e.target === e.currentTarget && onClose()}
      className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-[rgba(40,32,26,0.72)] px-5"
      style={{ paddingTop: "calc(20px + env(safe-area-inset-top, 0px))", paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" }}
    >
      {src ? (
        <img src={src} alt={card.name} className={`max-h-[72vh] max-w-[min(88vw,360px)] rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.35)] ${card.reversed ? "rotate-180" : ""}`} />
      ) : (
        <span className="rounded-xl bg-paper-light px-8 py-12 text-2xl text-ink">{card.name}</span>
      )}
      <span className="text-[15px] tracking-[0.1em] text-paper-light">{label(card)}</span>
      <span className="flex gap-2">
        {palace && onSelect && (
          <button type="button" onClick={onSelect} className={`rounded-full border border-paper-light/50 px-4 py-1 text-[13px] text-paper-light ${FOCUS}`}>
            {selected ? `取消點選${palace}` : `點選${palace}看飛化`}
          </button>
        )}
        <button ref={close} type="button" onClick={onClose} className={`rounded-full border border-paper-light/50 px-4 py-1 text-[13px] text-paper-light ${FOCUS}`}>
          關閉
        </button>
      </span>
    </div>
  );
}

// 全螢幕小圖盤
export function CardGallery({ cells, body, stage, onClose }: { cells: Cell[]; body: Card; stage: Card; onClose: () => void }) {
  const stageRef = useRef<HTMLDivElement>(null);
  const back = useRef<HTMLButtonElement>(null);
  const [size, setSize] = useState({ cw: 40, bw: 60, land: false });
  const [pick, setPick] = useState<Card>(cells[0].main);

  useLayoutEffect(() => {
    const fit = () => {
      const el = stageRef.current;
      if (!el) return;
      const W = el.clientWidth, H = el.clientHeight;
      if (!W || !H) return;
      const land = window.matchMedia("(orientation: landscape)").matches;
      // 直拿：盤面吃滿寬度，下方留給大圖；橫拿：盤面吃滿高度，右邊留給大圖
      const byW = ((land ? W * 0.7 : W) - 3 * GAP - 4 * PAIR_GAP) / 8;
      const byH = ((land ? H : H * 0.62) - 3 * GAP) / 4 / RATIO;
      const cw = Math.floor(Math.min(byW, byH));
      const ch = 2 * cw * RATIO + GAP - 2 * MARGIN;
      const bw = Math.floor(Math.min(ch / RATIO, (4 * cw + 2 * PAIR_GAP + GAP - 2 * MARGIN - 4) / 2));
      setSize({ cw, bw, land });
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);
  useEffect(() => {
    back.current?.focus();
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", key);
    // 圖卡畫面開著時，後面的頁面不要跟著捲
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const thumb = (c: Card, w: number) => {
    const src = cardThumb(c.name);
    return (
      <button
        type="button"
        onClick={() => setPick(c)}
        aria-label={`${label(c)}，看大圖`}
        className={`block overflow-hidden rounded-[3px] bg-line p-0 ${FOCUS}`}
        style={{ width: w, height: Math.round(w * RATIO) }}
      >
        {src ? (
          <img src={src} alt="" loading="lazy" className={`block h-full w-full object-cover ${c.reversed ? "rotate-180" : ""}`} />
        ) : (
          <span className={`flex h-full items-center justify-center text-[11px] text-ink ${c.reversed ? "rotate-180" : ""}`}>{c.name}</span>
        )}
      </button>
    );
  };
  const big = cardFull(pick.name);

  return (
    <div
      role="dialog"
      aria-label="圖卡"
      className="fixed inset-0 z-40 flex flex-col gap-1.5 bg-paper"
      style={{
        paddingTop: "calc(6px + env(safe-area-inset-top, 0px))",
        paddingBottom: "calc(6px + env(safe-area-inset-bottom, 0px))",
        paddingLeft: "max(6px, env(safe-area-inset-left, 0px))",
        paddingRight: "max(6px, env(safe-area-inset-right, 0px))",
      }}
    >
      <div className="flex items-center justify-between gap-2 px-1">
        <span className="text-xs text-ink-soft">圖卡・點牌在空白處看大圖</span>
        <button ref={back} type="button" onClick={onClose} className={`rounded-full border border-line-strong bg-paper-light px-3.5 py-1 text-[13px] text-ink ${FOCUS}`}>
          回文字盤
        </button>
      </div>
      <div ref={stageRef} className={`flex min-h-0 flex-1 items-center gap-2 ${size.land ? "flex-row" : "flex-col"}`}>
        <div className="grid flex-none" style={{ gridTemplateColumns: "repeat(4, auto)", gridTemplateRows: "repeat(4, auto)", gap: GAP }}>
          {cells.map((c) => {
            const [row, col] = POS[c.branch];
            return (
              <div key={c.palace} className="flex" style={{ gridRow: row, gridColumn: col, gap: PAIR_GAP }}>
                {thumb(c.main, size.cw)}
                {thumb(c.minor, size.cw)}
              </div>
            );
          })}
          <div className="relative flex items-center justify-center gap-1" style={{ gridRow: "2 / 4", gridColumn: "2 / 4", padding: MARGIN }}>
            {thumb(body, size.bw)}
            {thumb(stage, size.bw)}
            {cells.map((c) => {
              const [x, y] = LABEL_AT[c.branch];
              const dx = x === 0 ? `${MARGIN / 2}px` : x === 100 ? `${-MARGIN / 2}px` : "0px";
              const dy = y === 0 ? `${MARGIN / 2}px` : y === 100 ? `${-MARGIN / 2}px` : "0px";
              const tone = c.palace === "命宮" ? "rounded-[3px] bg-ink px-[3px] py-[2px] text-paper-light" : SANFANG.includes(c.palace) ? "font-medium text-apricot-deep" : "text-ink-soft";
              return (
                <span
                  key={c.palace}
                  aria-hidden
                  className={`pointer-events-none absolute text-xs leading-none whitespace-nowrap ${tone}`}
                  style={{ left: `calc(${x}% + ${dx})`, top: `calc(${y}% + ${dy})`, transform: "translate(-50%, -50%)" }}
                >
                  {SHORT[c.palace] ?? c.palace}
                </span>
              );
            })}
          </div>
        </div>
        <div className="flex min-h-0 w-full min-w-0 flex-1 flex-col items-center justify-center gap-1.5" style={size.land ? { height: "100%" } : undefined}>
          {big ? (
            <img src={big} alt={pick.name} className={`max-h-[calc(100%-26px)] max-w-full rounded-[10px] shadow-[0_4px_18px_rgba(40,32,26,0.25)] ${pick.reversed ? "rotate-180" : ""}`} />
          ) : (
            <span className="text-2xl text-ink">{pick.name}</span>
          )}
          <span aria-live="polite" className="text-[13px] tracking-[0.08em] text-ink">
            {label(pick)}
          </span>
        </div>
      </div>
    </div>
  );
}
