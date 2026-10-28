import { useState } from "react";
import { CARD_CATEGORY, CATEGORIES, fixOrient, hasOrient, isReversed, orientMark } from "./cards";
import { cardThumb } from "./cardImages";
import { CardZoom } from "./cardView";
import { cardSetToText, emptyPicks, explain, layoutOf, normId, type CardSet, type LayoutId, type Mcp, type Pick, type Picks } from "./cases";
import { toggleBlock } from "./chart";
import { randomIndex } from "./draw";
import { BUTTON_GHOST, CopyBox, FOCUS, TONES, shortTime } from "./ui";

// 牌陣頁的小牌型（2026/10/28）：三張（可多組）、三張＋身宮、命遷＋長生。
// 先取數（天干），牌由電腦隨機抽或手動選；盤上直接放牌卡圖（倒牌轉 180 度），不寫宮位干支。
// 「取X」「年X」按了才在牌下標四化（取數干實心、年干外框），盤下列出每化落在哪一格。
// 存成案例：牌組欄和案例選牌同一種寫法（cardSetToText），內文記取數、抽牌方式和四化。
// 手動選的牌存檔前都能改；電腦抽的不能改（和案例一樣）；存了就鎖住。

const SERVER = "Notion";
const CASE_SOURCE = "3a1eb16a-24f4-80aa-bb7c-000b6f53edb4";
const MUTAGEN_NAMES = ["祿", "權", "科", "忌"];
const MUTAGEN_TEXT = ["text-star-green", "text-star-earth", "text-star-blue", "text-star-red"];
const MUTAGEN_FILL = ["bg-star-green", "bg-star-earth", "bg-star-blue", "bg-star-red"];
const MUTAGEN_BORDER = ["border-star-green", "border-star-earth", "border-star-blue", "border-star-red"];

export type Small = {
  layout: LayoutId;
  set: CardSet;
  stem: string;
  life: string;
  kind: "問事" | "年運";
  question: string;
  year: string;
  at: string;
  nums?: [string, string];
  hand: boolean; // 手動選牌；false＝電腦隨機抽（抽完不能改）
  saved?: string; // 已存成案例的案例 ID
};

export const SMALL_NAMES: Record<LayoutId, string> = { three: "三張", body: "三張＋身宮", mq: "命遷＋長生" };
const POS_LABEL: Record<string, string> = { main: "主星", minor: "輔星", stage: "長生", body: "身宮", lifeMain: "命主", lifeMinor: "命輔", travelMain: "遷主", travelMinor: "遷輔" };
const FULL_LABEL: Record<string, string> = { lifeMain: "命宮主星", lifeMinor: "命宮輔星", travelMain: "遷移主星", travelMinor: "遷移輔星" };

type Slot = { g: number; key: string; categoryIds: string[] };
const slotsOf = (set: CardSet): Slot[] => set.groups.flatMap((_, g) => layoutOf(set.layout).slots.map((s) => ({ g, key: s.key, categoryIds: s.categoryIds })));
const sid = (s: { g: number; key: string }) => `${s.g}:${s.key}`;
const slotName = (set: CardSet, s: { g: number; key: string }) =>
  `${set.layout === "three" && set.groups.length > 1 ? `第${s.g + 1}組・` : ""}${FULL_LABEL[s.key] ?? POS_LABEL[s.key] ?? s.key}`;
export const smallFilled = (set: CardSet) => slotsOf(set).filter((s) => set.groups[s.g][s.key]).length;
export const smallTotal = (set: CardSet) => slotsOf(set).length;

// 抽牌：每格依類別抽、正倒隨機；同一陣不重複（只補空格，已經有的牌不動）
function fillRandom(set: CardSet): CardSet {
  const used = new Set(slotsOf(set).map((s) => set.groups[s.g][s.key]?.name).filter(Boolean) as string[]);
  const groups = set.groups.map((group) => ({ ...group }));
  for (const s of slotsOf(set)) {
    if (groups[s.g][s.key]) continue;
    const pile = CATEGORIES.filter((c) => s.categoryIds.includes(c.id)).flatMap((c) => c.groups.flatMap((x) => x.cards));
    const free = pile.filter((n) => !used.has(n));
    const name = (free.length ? free : pile)[randomIndex((free.length ? free : pile).length)];
    used.add(name);
    groups[s.g][s.key] = fixOrient({ name, reversed: randomIndex(2) === 1 });
  }
  return { ...set, groups };
}
export function newSmall(layout: LayoutId, base: Omit<Small, "layout" | "set" | "hand" | "saved">, hand: boolean): Small {
  const set: CardSet = { layout, groups: [emptyPicks(layout)] };
  return { ...base, layout, set: hand ? set : fillRandom(set), hand };
}

export function SmallSpread({
  value,
  onChange,
  mcp,
  person,
  yearGZ,
  starsOf,
  mutagens,
  numText,
  timeText,
  onReset,
  onSaved,
}: {
  value: Small;
  onChange: (s: Small) => void;
  mcp: Mcp | null;
  person: { id: string; name: string } | null;
  yearGZ: string;
  starsOf: (card: string) => string[];
  mutagens: Record<string, string[]>;
  numText: string;
  timeText: string;
  onReset: () => void;
  onSaved: (caseId: string) => void;
}) {
  const { set } = value;
  const slots = slotsOf(set);
  const editable = value.hand && !value.saved;
  const [active, setActive] = useState<string | null>(() => (editable ? (slots.find((s) => !set.groups[s.g][s.key]) ? sid(slots.find((s) => !set.groups[s.g][s.key])!) : null) : null));
  const [tabId, setTabId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Pick | null>(null);
  const [showDraw, setShowDraw] = useState(false);
  const [showYear, setShowYear] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [confirmReset, setConfirmReset] = useState(false);
  const filled = smallFilled(set);
  const total = smallTotal(set);
  const done = filled === total;
  const yearStem = yearGZ ? yearGZ[0] : "";

  const cardAt = (s: { g: number; key: string }) => set.groups[s.g][s.key];
  const tagsOf = (stem: string, card: Pick | null) => (card && stem ? mutagens[stem].map((star, i) => (starsOf(card.name).includes(star) ? i : -1)).filter((i) => i >= 0) : []);
  const hits = (stem: string) =>
    mutagens[stem].map((star, index) => ({
      star,
      index,
      where: slots.filter((s) => cardAt(s) && starsOf(cardAt(s)!.name).includes(star)).map((s) => `${slotName(set, s)}（${cardAt(s)!.name}）`),
    }));
  const hitText = (stem: string) => hits(stem).map((h) => `${h.star}化${MUTAGEN_NAMES[h.index]}→${h.where.length ? h.where.join("、") : "不在盤上"}`).join("；");

  function setSet(next: CardSet) {
    onChange({ ...value, set: next });
  }
  function pick(name: string) {
    if (!active) return;
    const [g, key] = [Number(active.split(":")[0]), active.split(":")[1]];
    const cur = set.groups[g][key];
    const groups = set.groups.map((group, i) => (i === g ? { ...group, [key]: fixOrient({ name, reversed: cur?.reversed ?? false }) } : group));
    const next = { ...set, groups };
    setSet(next);
    const all = slotsOf(next);
    const i = all.findIndex((s) => sid(s) === active);
    const empty = [...all.slice(i + 1), ...all.slice(0, i)].find((s) => !next.groups[s.g][s.key]);
    setActive(empty ? sid(empty) : null);
    setTabId(null);
  }
  function setReversed(reversed: boolean) {
    if (!active) return;
    const [g, key] = [Number(active.split(":")[0]), active.split(":")[1]];
    const cur = set.groups[g][key];
    if (!cur) return;
    setSet({ ...set, groups: set.groups.map((group, i) => (i === g ? { ...group, [key]: { ...cur, reversed } } : group)) });
  }
  function addGroup() {
    const next: CardSet = { ...set, groups: [...set.groups, emptyPicks("three")] };
    if (value.hand) {
      setSet(next);
      setActive(`${next.groups.length - 1}:main`);
    } else setSet(fillRandom(next));
  }
  function removeGroup(g: number) {
    setSet({ ...set, groups: set.groups.filter((_, i) => i !== g) });
    setActive(null);
  }

  async function save() {
    if (!mcp || !done || value.saved) return;
    setBusy(true);
    setMessage("");
    try {
      const title = value.question || (value.kind === "年運" ? `${person?.name ? `${person.name} ` : ""}${value.year} 年運` : SMALL_NAMES[value.layout]);
      const lines = [
        `- 類型：${value.kind === "年運" ? `年運（${value.year}）` : "問事"}`,
        `- 牌型：${SMALL_NAMES[value.layout]}${value.layout === "three" && set.groups.length > 1 ? `（${set.groups.length} 組）` : ""}`,
        `- 取數天干：${value.stem || "不取數"}`,
        ...(person ? [`- 命盤：${person.name || "未命名"}`] : []),
        `- 抽牌時間：${timeText}`,
        ...(value.stem ? [`- 取數方式：${numText}`] : []),
        `- 抽牌方式：${value.hand ? "手動選牌" : "電腦隨機抽牌"}`,
        ...(value.stem ? [`- 取數干四化：${hitText(value.stem)}`] : []),
        ...(yearGZ ? [`- 年干 ${yearGZ}（${value.kind === "年運" ? "" : "農曆 "}${value.year}）四化：${hitText(yearStem)}`] : []),
      ];
      const content = [`## 提問\n${title}`, toggleBlock(2, "牌陣", lines.join("\n")), "## 第一版判斷\n", "## 討論修正\n"].join("\n");
      const d = new Date(value.at);
      const pad = (n: number) => String(n).padStart(2, "0");
      const result = await mcp.callTool(SERVER, "notion-create-pages", {
        parent: { data_source_id: CASE_SOURCE },
        pages: [
          {
            properties: {
              案例名稱: title,
              "date:日期:start": `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
              "date:日期:is_datetime": 0,
              ...(person ? { 命盤: [normId(person.id)] } : {}),
              牌組: cardSetToText(set),
              狀態: "待驗證",
              驗證: "未知",
            },
            content,
          },
        ],
        allow_async: false,
      });
      const created = (result.payload as { pages?: { url?: string; id?: string }[] } | undefined)?.pages?.[0];
      const id = created ? normId(created.url || created.id || "") : "";
      onChange({ ...value, saved: id });
      setActive(null);
      setMessage("已存成案例。");
    } catch (e) {
      setMessage(explain(e as { code?: string; message?: string }) + "　如果案例清單裡已經出現，就是有存進去了。");
    }
    setBusy(false);
  }

  // 牌寬：一排三張，依畫面寬度（最寬 96px）
  const width = typeof window === "undefined" ? 360 : Math.min(window.innerWidth, 672);
  const cw = Math.floor(Math.min(96, (width - 16 - 24 - 20 - (value.layout === "mq" ? 8 + 24 + 1 : 20)) / 3));

  const cardSlot = (s: Slot, life = false) => {
    const card = cardAt(s);
    const on = active === sid(s);
    const src = card ? cardThumb(card.name) : null;
    const draw = showDraw && value.stem ? tagsOf(value.stem, card) : [];
    const year = showYear ? tagsOf(yearStem, card) : [];
    return (
      <div key={sid(s)} className="flex flex-col items-center gap-1" style={{ width: cw + 4 }}>
        <span className={`text-[11px] leading-none whitespace-nowrap ${life ? "font-medium text-wine" : "text-ink-soft"}`}>
          {POS_LABEL[s.key]}
          {card ? `・${card.name}${isReversed(card) ? "倒" : ""}` : ""}
        </span>
        <button
          type="button"
          aria-pressed={on}
          aria-label={`${slotName(set, s)}：${card ? `${card.name}${orientMark(card)}` : "未選"}`}
          // 可以改的時候：點空格或別格＝選這格、點已選中的那格＝看大圖；不能改的時候點牌就看大圖
          onClick={() => (!editable ? card && setZoom(card) : on && card ? setZoom(card) : (setActive(sid(s)), setTabId(null)))}
          className={`block overflow-hidden rounded-[5px] p-0 ${FOCUS} ${card ? "" : "flex items-center justify-center border border-dashed border-line-strong text-xs text-ink-soft"} ${on ? "outline-2 outline-offset-2 outline-wine" : ""}`}
          style={{ width: cw, height: Math.round((cw * 800) / 440) }}
        >
          {card && src ? (
            <img src={src} alt="" className={`block h-full w-full object-cover ${isReversed(card) ? "rotate-180" : ""}`} />
          ) : card ? (
            <span className={`text-sm ${isReversed(card) ? "rotate-180" : ""}`}>{card.name}</span>
          ) : (
            POS_LABEL[s.key] === "主星" || /主$/.test(POS_LABEL[s.key]) ? "主" : POS_LABEL[s.key] === "輔星" || /輔$/.test(POS_LABEL[s.key]) ? "副" : POS_LABEL[s.key]
          )}
        </button>
        <span className="flex min-h-[14px] gap-0.5 text-[10px] leading-none">
          {draw.map((i) => (
            <span key={`d${i}`} className={`rounded-[3px] border border-transparent px-[2px] py-[2px] text-paper-light ${MUTAGEN_FILL[i]}`}>
              {MUTAGEN_NAMES[i]}
            </span>
          ))}
          {year.map((i) => (
            <span key={`y${i}`} className={`rounded-[3px] border px-[2px] py-px ${MUTAGEN_TEXT[i]} ${MUTAGEN_BORDER[i]}`}>
              {MUTAGEN_NAMES[i]}
            </span>
          ))}
        </span>
      </div>
    );
  };

  const groupSlots = (g: number) => slots.filter((s) => s.g === g);
  const activeSlot = active ? slots.find((s) => sid(s) === active) ?? null : null;
  const cur = activeSlot ? cardAt(activeSlot) : null;
  const cats = activeSlot ? CATEGORIES.filter((c) => activeSlot.categoryIds.includes(c.id)) : [];
  const category = cats.find((c) => c.id === tabId) ?? (cur ? cats.find((c) => c.id === CARD_CATEGORY.get(cur.name)?.id) : undefined) ?? cats[0];
  const used = new Set(slots.filter((s) => sid(s) !== active).map((s) => cardAt(s)?.name).filter(Boolean) as string[]);

  const list = (stem: string, label: string, tone: string) => (
    <div className="flex flex-col gap-1 border-t border-line-strong pt-2.5 text-[12.5px]">
      <span className={`text-xs ${tone}`}>{label}</span>
      {hits(stem).map((h) => (
        <span key={h.index} className="flex gap-1.5">
          <span className={`shrink-0 ${MUTAGEN_TEXT[h.index]}`}>
            {h.star}化{MUTAGEN_NAMES[h.index]}
          </span>
          {h.where.length ? <span className="text-ink">→ {h.where.join("、")}</span> : <span className="text-ink-soft/50">→ 不在盤上</span>}
        </span>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      {/* 點盤面空白處（不是牌、不是按鈕）＝取消選取那一格，框框和選牌區收起來 */}
      <div className="flex flex-col gap-3 rounded-xl bg-paper px-2.5 py-3" onClick={(e) => editable && active && !(e.target as HTMLElement).closest("button") && setActive(null)}>
        <div className="flex items-center justify-between gap-2 px-1">
          <span className="text-xs text-ink-soft">
            {SMALL_NAMES[value.layout]}
            {value.stem ? `・取${value.stem}` : ""}
          </span>
          <span className="flex gap-1.5">
            {value.stem && <button type="button" aria-pressed={showDraw} aria-label="取數干" onClick={() => setShowDraw(!showDraw)} className={`rounded-full border border-ink px-2.5 py-0.5 text-[11px] ${FOCUS} ${showDraw ? "bg-ink text-paper-light" : "text-ink"}`}>
              取{value.stem}
            </button>}
            {yearGZ && (
              <button type="button" aria-pressed={showYear} aria-label="年干" onClick={() => setShowYear(!showYear)} className={`rounded-full border border-wine px-2.5 py-0.5 text-[11px] ${FOCUS} ${showYear ? "bg-wine text-paper-light" : "text-wine"}`}>
                年{yearStem}
              </button>
            )}
          </span>
        </div>

        {value.layout === "mq" ? (
          // 命遷＋長生：左邊上下兩排（上命宮、下遷移），長生在右邊上下置中
          <div className="flex items-center justify-center gap-3">
            <div className="flex flex-col gap-2.5">
              {[
                ["命宮", ["lifeMain", "lifeMinor"]],
                ["遷移", ["travelMain", "travelMinor"]],
              ].map(([title, keys]) => (
                <div key={title as string} className="flex flex-col items-center gap-1">
                  <span className="text-[11px] text-ink-soft">{title as string}</span>
                  <div className="flex gap-2">{(keys as string[]).map((k) => cardSlot(slots.find((s) => s.key === k)!, title === "命宮"))}</div>
                </div>
              ))}
            </div>
            <span className="w-px self-stretch bg-line-strong" />
            {cardSlot(slots.find((s) => s.key === "stage")!)}
          </div>
        ) : (
          <>
            {set.groups.map((_, g) => (
              <div key={g} className="flex flex-col items-center gap-1">
                {set.groups.length > 1 && (
                  <span className="flex items-center gap-2 text-[11px] text-ink-soft">
                    第 {g + 1} 組
                    {editable && (
                      <button type="button" onClick={() => removeGroup(g)} className={`underline underline-offset-4 hover:text-danger ${FOCUS}`}>
                        刪除
                      </button>
                    )}
                  </span>
                )}
                <div className="flex justify-center gap-2.5">{groupSlots(g).filter((s) => s.key !== "body").map((s) => cardSlot(s))}</div>
              </div>
            ))}
            {value.layout === "body" && <div className="flex justify-center">{cardSlot(slots.find((s) => s.key === "body")!)}</div>}
            {value.layout === "three" && !value.saved && (
              <button type="button" onClick={addGroup} className={`w-fit self-start px-1 text-xs text-ink-soft underline underline-offset-4 ${FOCUS}`}>
                ＋再加一組
              </button>
            )}
          </>
        )}

        {showDraw && value.stem && list(value.stem, `取數干 ${value.stem} 四化`, "text-ink-soft")}
        {showYear && yearGZ && list(yearStem, `年干 ${yearGZ}（${value.kind === "年運" ? "" : "農曆 "}${value.year}）四化`, "text-wine")}
      </div>

      {editable && (
        <span className="text-xs text-ink-soft tabular-nums">{done ? `${total} 張都選好了，存檔前點牌還能改` : `手動選牌・已選 ${filled}／${total}`}</span>
      )}

      {editable && activeSlot && category && (
        <div className="rounded-xl bg-paper p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-sm text-ink">{slotName(set, activeSlot)}</span>
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
                    onClick={() => setReversed(reversed)}
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
            <div role="tablist" aria-label="分類" className="mb-3 flex gap-4 border-b border-line">
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

      {/* 選滿才給複製文字：第一行時間、牌型、問事／年運、取數，第二行和案例牌組欄同一種寫法 */}
      {done && (
        <CopyBox
          text={`${shortTime(value.at)} ${SMALL_NAMES[value.layout]}｜${value.kind}${value.kind === "年運" ? ` ${value.year}` : ""}｜${value.stem ? `取數${value.stem}干` : "不取數"}${value.question ? `｜${value.question}` : ""}\n${cardSetToText(set)}`}
        />
      )}

      <div className="flex flex-wrap items-center gap-3">
        {mcp && (
          <button type="button" disabled={busy || !done || !!value.saved} onClick={save} className={`${BUTTON_GHOST} bg-paper-light px-5 py-2`}>
            {busy ? "存檔中…" : value.saved ? "已存成案例" : "存成案例"}
          </button>
        )}
        {value.saved && (
          <button type="button" onClick={() => onSaved(value.saved!)} className={`text-sm underline underline-offset-4 ${FOCUS}`}>
            到案例看 →
          </button>
        )}
        <button type="button" onClick={() => (value.saved || !filled ? onReset() : setConfirmReset(true))} className={`text-sm text-ink-soft underline underline-offset-4 ${FOCUS}`}>
          重新抽
        </button>
        {confirmReset && (
          <span role="alert" className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-apricot-soft px-3 py-2 text-sm text-apricot-deep">
            這盤還沒存，確定要重抽嗎？
            <button
              type="button"
              onClick={() => {
                setConfirmReset(false);
                onReset();
              }}
              className={`rounded-full bg-ink px-3 py-1 text-xs text-paper-light ${FOCUS}`}
            >
              確定重抽
            </button>
            <button type="button" onClick={() => setConfirmReset(false)} className={`text-xs underline underline-offset-4 ${FOCUS}`}>
              取消
            </button>
          </span>
        )}
        {!done && mcp && <span className="text-xs text-ink-soft">選滿 {total} 張才能存</span>}
        {message && <span className="text-xs text-ink-soft">{message}</span>}
      </div>
      {zoom && <CardZoom card={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}
