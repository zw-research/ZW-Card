import { useRef, useState } from "react";
import { CARD_CATEGORY, CATEGORIES, fixOrient, hasOrient, isReversed, orientMark } from "./cards";
import { CardZoom } from "./cardView";
import { PhotoError, readPhoto, type PhotoResult } from "./photoRead";
import { FOCUS, TONES } from "./ui";

// 牌陣手動選牌（2026/10/28）：取數決定命宮和宮干後，盤面是空的；點一格、從下面選牌（和案例選牌同一套分類分頁），
// 選完自動跳下一格（命宮主→命宮副→兄弟主…父母副→身宮→長生）；同一陣同一張牌只能用一次（長生自成一組）。
// 選滿 26 張才能按「完成選牌」；還沒選滿可以隨時離開，草稿存在瀏覽器。

export type Card = { name: string; reversed: boolean };
export type DraftCell = { palace: string; branch: string; stem: string; main: Card | null; minor: Card | null };
export type Draft = { stem: string; life: string; cells: DraftCell[]; body: Card | null; stage: Card | null; kind: "問事" | "年運"; question: string; year: string; at: string; nums?: [string, string]; chosen?: boolean; fixedFrom?: string };

const POS: Record<string, [number, number]> = {
  巳: [1, 1], 午: [1, 2], 未: [1, 3], 申: [1, 4], 辰: [2, 1], 酉: [2, 4], 卯: [3, 1], 戌: [3, 4], 寅: [4, 1], 丑: [4, 2], 子: [4, 3], 亥: [4, 4],
};
const SANFANG_BG: Record<string, string> = { 命宮: "bg-apricot/45", 財帛: "bg-apricot-soft", 官祿: "bg-apricot-soft", 遷移: "bg-apricot-soft" };
const SHA = ["擎羊", "陀羅", "火星", "鈴星", "化忌"];

type Key = string; // c0m／c0n …、body、stage
type Kind = "main" | "minor" | "stage";
const ORDER: { key: Key; kind: Kind }[] = [
  ...Array.from({ length: 12 }, (_, i) => [
    { key: `c${i}m`, kind: "main" as Kind },
    { key: `c${i}n`, kind: "minor" as Kind },
  ]).flat(),
  { key: "body", kind: "main" },
  { key: "stage", kind: "stage" },
];
const KIND_CATS: Record<Kind, string[]> = { main: ["main", "pair"], minor: ["minor"], stage: ["stage"] };

export function getCard(d: Draft, key: Key): Card | null {
  if (key === "body") return d.body;
  if (key === "stage") return d.stage;
  const c = d.cells[Number(key.slice(1, -1))];
  return key.endsWith("m") ? c.main : c.minor;
}
function setCard(d: Draft, key: Key, card: Card): Draft {
  if (key === "body") return { ...d, body: card };
  if (key === "stage") return { ...d, stage: card };
  const i = Number(key.slice(1, -1));
  return { ...d, cells: d.cells.map((c, k) => (k === i ? (key.endsWith("m") ? { ...c, main: card } : { ...c, minor: card }) : c)) };
}
export const pickedCount = (d: Draft) => ORDER.filter((o) => getCard(d, o.key)).length;
const slotLabel = (d: Draft, key: Key) => (key === "body" ? "身宮" : key === "stage" ? "長生" : `${d.cells[Number(key.slice(1, -1))].palace}・${key.endsWith("m") ? "主星" : "輔星"}`);
const cardText = (c: Card) => `${c.name}${orientMark(c)}`;

// ── 拍照讀牌（2026/11/01）：照片在手機上直接和牌卡圖比對（photoRead.ts），不用 Claude、不花用量；
// 填進草稿，沒把握的格子加金框，本人核對完才按「完成選牌」。
const namesOf = (ids: string[]) => CATEGORIES.filter((c) => ids.includes(c.id)).flatMap((c) => c.groups.flatMap((g) => g.cards));
const KINDS = { main: namesOf(["main", "pair"]), minor: namesOf(["minor"]), stage: namesOf(["stage"]) };
function applyRead(d: Draft, r: PhotoResult) {
  const doubt = new Set<Key>();
  let next = d;
  const put = (key: Key, p: { name: string; reversed: boolean; doubt: boolean }) => {
    next = setCard(next, key, fixOrient({ name: p.name, reversed: p.reversed }));
    if (p.doubt) doubt.add(key);
  };
  d.cells.forEach((c, i) => {
    put(`c${i}m`, r.cells[c.branch].main);
    put(`c${i}n`, r.cells[c.branch].minor);
  });
  put("body", r.body);
  put("stage", r.stage);
  return { next, doubt };
}

export function SpreadPicker({ draft, onChange, onDone, title }: { draft: Draft; onChange: (d: Draft) => void; onDone: () => void; title: string }) {
  const [active, setActive] = useState<Key | null>(() => ORDER.find((o) => !getCard(draft, o.key))?.key ?? null);
  const [tabId, setTabId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Card | null>(null);
  const count = pickedCount(draft);
  // 拍照讀牌：在手機上比對牌卡圖，幾秒就好
  const [reading, setReading] = useState(false);
  const [readMsg, setReadMsg] = useState("");
  const [doubt, setDoubt] = useState<Set<Key>>(new Set());
  const [confirmPhoto, setConfirmPhoto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // 讀牌要約 1 秒：讀完套在「那時最新」的草稿上，讀牌中按了改取數不會被蓋回去（2026/11/3 修）
  const latest = useRef(draft);
  latest.current = draft;
  const dropDoubt = (key: Key) => doubt.has(key) && setDoubt((s) => new Set([...s].filter((k) => k !== key)));
  async function readFile(file: File) {
    if (reading) return;
    setReading(true);
    setReadMsg("");
    try {
      const r = await readPhoto(file, KINDS);
      const { next, doubt: d } = applyRead(latest.current, r);
      onChange(next);
      setDoubt(d);
      setActive(null);
      setReadMsg(`26 張都填好了${d.size ? `，${d.size} 格比較沒把握（金框）` : ""}；請對照實體牌核對每一格，倒牌特別注意。`);
    } catch (e) {
      console.warn("拍照讀牌失敗", e);
      setReadMsg(`沒讀成功：${e instanceof PhotoError ? e.message : "照片處理失敗，換一張再試，或改用手選"}`);
    }
    setReading(false);
  }

  function choose(key: Key) {
    setActive(key);
    setTabId(null);
  }
  function pick(name: string) {
    if (!active || reading) return; // 讀牌中先不收手選，讀完會整盤填上
    dropDoubt(active);
    const cur = getCard(draft, active);
    const next = setCard(draft, active, fixOrient({ name, reversed: cur?.reversed ?? false }));
    onChange(next);
    // 自動跳到下一個空格（往後找，找不到再從頭找）
    const i = ORDER.findIndex((o) => o.key === active);
    const empty = [...ORDER.slice(i + 1), ...ORDER.slice(0, i)].find((o) => !getCard(next, o.key));
    setActive(empty ? empty.key : null);
    setTabId(null);
  }

  const slot = (key: Key, big = false) => {
    const card = getCard(draft, key);
    const on = key === active;
    const ink = card ? (SHA.includes(card.name) ? "text-star-red border-star-red" : card.name === "祿存" ? "text-star-green border-star-green" : isReversed(card) ? "text-mist-deep" : "text-ink") : "";
    const face = card ? (isReversed(card) ? "bg-mist-soft border-mist" : "bg-taupe-soft border-taupe") : "border-dashed border-line-strong bg-transparent text-ink-soft";
    const empty = key === "stage" ? "長生" : key === "body" || key.endsWith("m") ? "主" : "副";
    return (
      <button
        key={key}
        type="button"
        aria-pressed={on}
        aria-label={`${slotLabel(draft, key)}：${card ? cardText(card) : "未選"}${on && card ? "，再點一次看大圖" : ""}`}
        // 和案例選牌一樣：點空格或別格＝選這格；點已選中的那格＝看大圖
        onClick={() => (on && card ? setZoom(card) : choose(key))}
        className={`flex items-center justify-center rounded-[5px] border ${face} ${ink} ${big ? "h-[88px] w-[52px] text-xl" : "h-[58px] w-[33px] text-[14px]"} leading-none font-medium ${FOCUS} ${on ? "outline-2 outline-offset-1 outline-wine" : doubt.has(key) ? "ring-2 ring-gold" : ""}`}
      >
        {card ? (
          <span className={`flex flex-col items-center gap-0.5 ${isReversed(card) ? "rotate-180" : ""}`}>
            {[...card.name].map((ch, i) => (
              <span key={i}>{ch}</span>
            ))}
          </span>
        ) : (
          <span className="text-[11px] font-normal">{empty}</span>
        )}
      </button>
    );
  };

  const kind = active ? ORDER.find((o) => o.key === active)!.kind : null;
  const cur = active ? getCard(draft, active) : null;
  const cats = kind ? CATEGORIES.filter((c) => KIND_CATS[kind].includes(c.id)) : [];
  const category = cats.find((c) => c.id === tabId) ?? (cur ? cats.find((c) => c.id === CARD_CATEGORY.get(cur.name)?.id) : undefined) ?? cats[0];
  // 已經用在別格的牌不能再選（長生只有一格，不受影響）
  const used = new Set(ORDER.filter((o) => o.key !== active).map((o) => getCard(draft, o.key)?.name).filter(Boolean) as string[]);

  return (
    <div className="flex flex-col gap-2">
      {/* 取數先講清楚：實體牌要照命宮位置擺 */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-paper px-3 py-2 text-sm">
        <span className="text-ink">
          取數 <b className="font-medium text-wine">{draft.stem}干</b>・命宮在<b className="font-medium text-wine">{draft.life}</b>
        </span>
        <span className="text-xs text-ink-soft">照盤上宮位擺牌</span>
        <span className="ml-auto flex items-center gap-2">
          {reading ? (
            <span className="text-xs text-ink-soft">讀牌中…</span>
          ) : (
            <button
              type="button"
              onClick={() => (count > 0 ? setConfirmPhoto(true) : fileRef.current?.click())}
              className={`rounded-full border border-line-strong bg-paper-light px-3 py-0.5 text-[13px] text-ink ${FOCUS}`}
            >
              拍照讀牌
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) readFile(f);
            }}
          />
        </span>
        {confirmPhoto && (
          <span role="alert" className="flex w-full flex-wrap items-center gap-2 text-xs text-apricot-deep">
            已選的 {count} 張會被照片讀到的蓋過，確定嗎？
            <button
              type="button"
              onClick={() => {
                setConfirmPhoto(false);
                fileRef.current?.click();
              }}
              className={`rounded-full bg-ink px-3 py-0.5 text-paper-light ${FOCUS}`}
            >
              拍照讀牌
            </button>
            <button type="button" onClick={() => setConfirmPhoto(false)} className={`underline underline-offset-4 ${FOCUS}`}>
              取消
            </button>
          </span>
        )}
        {readMsg && <span className="w-full text-xs text-apricot-deep">{readMsg}</span>}
      </div>
      {/* 點盤面空白處（不是牌）＝取消選取那一格，框框和選牌區收起來 */}
      <div className="grid grid-cols-4 grid-rows-[repeat(4,auto)] gap-px border border-line bg-line" onClick={(e) => active && !(e.target as HTMLElement).closest("button") && setActive(null)}>
        {draft.cells.map((c, i) => {
          const [row, col] = POS[c.branch];
          return (
            <div key={c.palace} style={{ gridRow: row, gridColumn: col }} className={`flex min-w-0 flex-col items-center gap-1.5 px-1 pt-1.5 pb-2.5 ${SANFANG_BG[c.palace] ?? "bg-paper-light"}`}>
              <span className="flex w-full items-baseline justify-between px-0.5 text-[11px] leading-none">
                <span className={c.palace === "命宮" ? "font-medium text-wine" : "text-ink"}>{c.palace}</span>
                <span className="text-ink-soft">
                  {c.stem}
                  {c.branch}
                </span>
              </span>
              <span className="mt-1.5 flex gap-1">
                {slot(`c${i}m`)}
                {slot(`c${i}n`)}
              </span>
            </div>
          );
        })}
        <div style={{ gridRow: "2 / 4", gridColumn: "2 / 4" }} className="flex flex-col items-center justify-center gap-2 bg-paper px-2 py-3">
          <span className="line-clamp-2 text-center text-xs text-ink">{title}</span>
          <div className="flex items-end gap-4">
            <span className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] text-ink-soft">身宮</span>
              {slot("body", true)}
            </span>
            <span className="flex flex-col items-center gap-0.5">
              <span className="text-[10px] text-ink-soft">長生</span>
              {slot("stage", true)}
            </span>
          </div>
          <span className="text-[10px] text-ink-soft">
            取{draft.stem}・命宮在{draft.life}
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-ink-soft tabular-nums">{count < 26 ? `手動選牌・已選 ${count}／26` : "26 張都選好了"}</span>
        <button type="button" disabled={count < 26} onClick={onDone} className={`rounded-full bg-ink px-4 py-1 text-[13px] text-paper-light disabled:opacity-35 ${FOCUS}`}>
          完成選牌
        </button>
      </div>

      {active && kind && category && (
        <div className="rounded-xl bg-paper p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm text-ink">{slotLabel(draft, active)}</span>
            {cur && !hasOrient(cur.name) ? (
              <span className="text-xs text-ink-soft">空宮不分正倒</span>
            ) : (
            <div role="group" aria-label="正倒位" className="grid grid-cols-2 overflow-hidden rounded-full border border-line">
              {[false, true].map((reversed) => {
                const on = !!cur && cur.reversed === reversed;
                return (
                  <button
                    key={String(reversed)}
                    type="button"
                    aria-pressed={on}
                    disabled={!cur}
                    onClick={() => {
                      if (!cur) return;
                      dropDoubt(active);
                      onChange(setCard(draft, active, { ...cur, reversed }));
                    }}
                    className={`px-4 py-0.5 text-xs disabled:opacity-40 ${FOCUS} ${on ? (reversed ? "bg-gold-deep text-paper-light" : "bg-ink text-paper-light") : "text-ink-soft"}`}
                  >
                    {reversed ? "倒" : "正"}
                  </button>
                );
              })}
            </div>
            )}
          </div>
          {cats.length > 1 && (
            <div role="tablist" aria-label={`${slotLabel(draft, active)}分類`} className="mb-3 flex gap-4 border-b border-line">
              {cats.map((item) => {
                const sel = item.id === category.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={sel}
                    onClick={() => setTabId(item.id)}
                    className={`-mb-px border-b-2 px-1 pb-2 text-sm tracking-[0.12em] ${FOCUS} ${sel ? `${TONES[item.tone].border} ${TONES[item.tone].text} font-medium` : "border-transparent text-ink-soft"}`}
                  >
                    {item.name}
                  </button>
                );
              })}
            </div>
          )}
          <div className="flex flex-col gap-3">
            {category.groups.map((group) => (
              <div key={group.name}>
                {category.groups.length > 1 && <h4 className="mb-1.5 text-xs tracking-[0.12em] text-ink-soft">{group.name}</h4>}
                <div className="flex flex-wrap gap-1.5">
                  {group.cards.map((name) => {
                    const taken = used.has(name);
                    return (
                      <button
                        key={name}
                        type="button"
                        aria-pressed={cur?.name === name}
                        disabled={taken}
                        title={taken ? "這張已經用在別的位置" : undefined}
                        onClick={() => pick(name)}
                        className={`rounded-full border px-3 py-1.5 text-sm tracking-[0.1em] disabled:line-through disabled:opacity-35 ${FOCUS} ${
                          cur?.name === name ? TONES[category.tone].active : `border-transparent ${TONES[category.tone].chip}`
                        }`}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      {!active && count >= 26 && <p className="text-xs text-ink-soft">點任一張牌可以改；按「完成選牌」後就和電腦抽的盤一樣，可以看四化、煞忌和存成案例。</p>}
      {zoom && <CardZoom card={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}
