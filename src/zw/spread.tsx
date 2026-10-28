import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { solar2lunar } from "lunar-lite";
import { CARD_CATEGORY, CATEGORIES, fixOrient, hasOrient, isReversed, orientMark } from "./cards";
import { explain, normId, type Mcp } from "./cases";
import { GUA_PALACES, TIMES, toggleBlock } from "./chart";
import { branchOf, randomIndex, stemOf } from "./draw";
import type { GuaPerson } from "./gua";
import { BUTTON_GHOST, BUTTON_PRIMARY, CopyBox, FOCUS, INPUT, shortTime } from "./ui";
import { CardGallery, CardZoom } from "./cardView";
import { SpreadPicker, pickedCount, type Draft } from "./spreadPick";
import { SMALL_NAMES, SmallSpread, newSmall, type Small } from "./smallSpread";
import type { LayoutId } from "./cases";

// 牌陣：隨機取數天干＋隨機命宮，十二宮各抽一張主牌（主星／雙星／空宮）、一張副牌（輔星），
// 中央是身宮（主牌）和長生。不照排盤規則，所有牌都可能出現；同一陣不重複抽（像真的牌堆）。
const SERVER = "Notion";
const CASE_SOURCE = "3a1eb16a-24f4-80aa-bb7c-000b6f53edb4";
const STEMS = "甲乙丙丁戊己庚辛壬癸";
const BRANCHES = "子丑寅卯辰巳午未申酉戌亥";
const LAST_KEY = "zw-chart.spread";
const DRAFT_KEY = "zw-chart.spread-draft"; // 手動選牌還沒選完的草稿
const SMALL_KEY = "zw-chart.spread-small"; // 小牌型（三張、三張＋身宮、命遷＋長生）目前這盤
const MUTAGEN_NAMES = ["祿", "權", "科", "忌"];
const MUTAGEN_TEXT = ["text-star-green", "text-star-earth", "text-star-blue", "text-star-red"];
const MUTAGEN_FILL = ["bg-star-green", "bg-star-earth", "bg-star-blue", "bg-star-red"];
const MUTAGEN_BORDER = ["border-star-green", "border-star-earth", "border-star-blue", "border-star-red"];

// 四化表：和命盤頁（chart.tsx 的 astro.config）同一組，戊貪陰右機、庚陽武同相、壬梁紫左武
const MUTAGENS: Record<string, string[]> = {
  甲: ["廉貞", "破軍", "武曲", "太陽"],
  乙: ["天機", "天梁", "紫微", "太陰"],
  丙: ["天同", "天機", "文昌", "廉貞"],
  丁: ["太陰", "天同", "天機", "巨門"],
  戊: ["貪狼", "太陰", "右弼", "天機"],
  己: ["武曲", "貪狼", "天梁", "文曲"],
  庚: ["太陽", "武曲", "天同", "天相"],
  辛: ["巨門", "太陽", "文曲", "文昌"],
  壬: ["天梁", "紫微", "左輔", "武曲"],
  癸: ["破軍", "巨門", "太陰", "貪狼"],
};

// 祿存所在地支；擎羊在祿存前一支（順行），陀羅在後一支
const LU_CUN: Record<string, string> = { 甲: "寅", 乙: "卯", 丙: "巳", 丁: "午", 戊: "巳", 己: "午", 庚: "申", 辛: "酉", 壬: "亥", 癸: "子" };
const LYT = ["祿存", "擎羊", "陀羅"] as const;
const LYT_SHORT = ["存", "羊", "陀"];
function luYangTuo(stem: string): string[] {
  const i = BRANCHES.indexOf(LU_CUN[stem]);
  return [BRANCHES[i], BRANCHES[(i + 1) % 12], BRANCHES[(i + 11) % 12]];
}
// 命宮的三方四正（命、財、官、遷）底色：命宮深一點，其他三宮淡一點
const SANFANG_BG: Record<string, string> = { 命宮: "bg-apricot/45", 財帛: "bg-apricot-soft", 官祿: "bg-apricot-soft", 遷移: "bg-apricot-soft" };
// 紅字牌：四煞和化忌
const SHA = ["擎羊", "陀羅", "火星", "鈴星", "化忌"];

// 實際年干支：年份換干支；問事用抽牌當天的農曆年（過春節才換年）
export function yearGanzhi(year: number) {
  return `${STEMS[(((year - 4) % 10) + 10) % 10]}${BRANCHES[(((year - 4) % 12) + 12) % 12]}`;
}
function lunarYearOf(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  try {
    return solar2lunar(`${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`).lunarYear;
  } catch {
    return date.getFullYear();
  }
}

// 雙星牌的每個字對應的主星
const PAIR_CHAR: Record<string, string> = {
  紫: "紫微", 府: "天府", 貪: "貪狼", 相: "天相", 殺: "七殺", 破: "破軍", 機: "天機", 陰: "太陰", 月: "太陰",
  巨: "巨門", 梁: "天梁", 日: "太陽", 陽: "太陽", 武: "武曲", 同: "天同", 廉: "廉貞",
};
const deck = (ids: string[]) => CATEGORIES.filter((c) => ids.includes(c.id)).flatMap((c) => c.groups.flatMap((g) => g.cards));
const MAIN_DECK = deck(["main", "pair"]);
const MINOR_DECK = deck(["minor"]);
const STAGE_DECK = deck(["stage"]);

// 這張牌含有哪些星（給四化對位用）
function starsOf(card: string) {
  if (CARD_CATEGORY.get(card)?.id === "pair") return [...card].map((ch) => PAIR_CHAR[ch]).filter(Boolean);
  return [card];
}

// 五虎遁：年干定寅宮天干，順排十二宮
export function palaceStem(yearStem: string, branch: string) {
  const start = ((STEMS.indexOf(yearStem) % 5) * 2 + 2) % 10;
  const offset = (BRANCHES.indexOf(branch) - 2 + 12) % 12;
  return STEMS[(start + offset) % 10];
}

type Card = { name: string; reversed: boolean };
type Cell = { palace: string; branch: string; stem: string; main: Card; minor: Card };
export type Spread = {
  stem: string;
  life: string;
  cells: Cell[]; // 依 命宮、兄弟…父母 的順序
  body: Card;
  stage: Card;
  kind: "問事" | "年運";
  question: string;
  year: string; // 年運＝指定年份；問事＝抽牌當天的農曆年
  at: string; // ISO
  nums?: [string, string]; // 手動取數的兩個數（數一→取數天干、數二→命宮地支）；電腦隨機時沒有
  saved?: string; // 已存成案例的案例 ID（只記在瀏覽器，重開頁面才知道這盤存過，不會重複存）
  hand?: boolean; // 手動選牌（存案例時內文記「抽牌方式：手動選牌」）
};

function shuffle<T>(list: T[]) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
// 正倒隨機；空宮不分正倒
const flip = (name: string): Card => fixOrient({ name, reversed: randomIndex(2) === 1 });

// 取數：有手動輸入兩個數就用手動（換算規則和取卦相同：數一 ÷10 定天干、數二 ÷12 定地支），否則電腦隨機
function deal(kind: Spread["kind"], question: string, year: string, nums: [string, string] | null): Spread {
  const stem = nums ? stemOf(nums[0]) : STEMS[randomIndex(10)];
  const life = nums ? branchOf(nums[1]) : BRANCHES[randomIndex(12)];
  const mains = shuffle(MAIN_DECK);
  const minors = shuffle(MINOR_DECK);
  const lifeIndex = BRANCHES.indexOf(life);
  const cells = GUA_PALACES.map((palace, k) => {
    // 宮位逆時針排：命宮往前一支是兄弟
    const branch = BRANCHES[(lifeIndex - k + 12) % 12];
    return { palace, branch, stem: palaceStem(stem, branch), main: flip(mains[k]), minor: flip(minors[k]) };
  });
  const now = new Date();
  return {
    stem,
    life,
    cells,
    body: flip(mains[12]),
    stage: flip(STAGE_DECK[randomIndex(12)]),
    kind,
    question,
    year: kind === "年運" ? year : String(lunarYearOf(now)),
    at: now.toISOString(),
    ...(nums ? { nums } : {}),
  };
}

// ---------- 存案例用的文字（牌組欄位）----------
// 牌陣｜取數丁干｜命宮在未｜問事 2026；命宮丁未：紫貪正｜文昌正；……；身宮：機陰正｜養倒
// （第一版寫成「丁干」「問事」不帶年份，讀的時候也接受）
const cardText = (card: Card) => `${card.name}${orientMark(card)}`;
export function spreadText(s: Spread) {
  return [
    `牌陣｜取數${s.stem}干｜命宮在${s.life}｜${s.kind} ${s.year}`,
    ...s.cells.map((c) => `${c.palace}${c.stem}${c.branch}：${cardText(c.main)}｜${cardText(c.minor)}`),
    `身宮：${cardText(s.body)}｜${cardText(s.stage)}`,
  ].join("；");
}

const parseCard = (text: string): Card | null => {
  const bare = text.trim();
  if (CARD_CATEGORY.has(bare) && !hasOrient(bare)) return { name: bare, reversed: false };
  const m = bare.match(/^(.+?)(正|倒)$/);
  return m && CARD_CATEGORY.has(m[1]) ? fixOrient({ name: m[1], reversed: m[2] === "倒" }) : null;
};
export const isSpreadText = (text: string) => /^牌陣｜/.test((text || "").trim());
export function parseSpreadText(text: string, extra: { question?: string; at?: string } = {}): Spread | null {
  const groups = (text || "").trim().split("；");
  const head = groups[0]?.match(/^牌陣｜(?:取數)?([甲乙丙丁戊己庚辛壬癸])干｜命宮在([子丑寅卯辰巳午未申酉戌亥])｜(問事|年運)\s*(\d*)$/);
  if (!head || groups.length !== 14) return null;
  const cells: Cell[] = [];
  for (const [k, group] of groups.slice(1, 13).entries()) {
    const m = group.match(/^(.+?)([甲乙丙丁戊己庚辛壬癸])([子丑寅卯辰巳午未申酉戌亥])：(.+?)｜(.+)$/);
    const main = m && parseCard(m[4]);
    const minor = m && parseCard(m[5]);
    if (!m || !main || !minor || m[1] !== GUA_PALACES[k]) return null;
    cells.push({ palace: m[1], stem: m[2], branch: m[3], main, minor });
  }
  const last = groups[13].match(/^身宮：(.+?)｜(.+)$/);
  const body = last && parseCard(last[1]);
  const stage = last && parseCard(last[2]);
  if (!body || !stage) return null;
  return {
    stem: head[1],
    life: head[2],
    cells,
    body,
    stage,
    kind: head[3].startsWith("年運") ? "年運" : "問事",
    question: extra.question ?? "",
    year: head[4] || (extra.at ? String(lunarYearOf(new Date(extra.at))) : ""),
    at: extra.at ?? "",
  };
}

// 煞忌計數：每宮的四煞牌、化忌牌，加上有顯示的取數干／年干的擎羊、陀羅、化忌落點（身宮不算、空劫不算、飛化不算）
const SHA_STARS = ["擎羊", "陀羅", "火星", "鈴星"];
type Layer = { tag: string; lyt: string[]; ji: Hit | undefined };
function shaJiMap(s: Spread, layers: Layer[]) {
  const map = new Map<string, string[]>();
  const add = (palace: string, label: string) => map.set(palace, [...(map.get(palace) ?? []), label]);
  for (const c of s.cells) {
    for (const card of [c.main, c.minor]) {
      if (SHA_STARS.includes(card.name) || card.name === "化忌") add(c.palace, card.name);
    }
  }
  for (const { tag, lyt, ji } of layers) {
    add(lyt[1], `擎羊（${tag}）`);
    add(lyt[2], `陀羅（${tag}）`);
    for (const w of ji?.where ?? []) if (w !== "身宮") add(w, `${ji!.star}化忌（${tag}）`);
  }
  return map;
}
const atLeastTwo = (map: Map<string, string[]>) => new Map([...map].filter(([, list]) => list.length >= 2));
// 對宮線：兩宮的煞忌合起來兩顆以上，兩宮都圈（只在「取數干」「年干」都沒按時用）
function axisMap(s: Spread, map: Map<string, string[]>) {
  const out: { pair: [string, string]; list: string[] }[] = [];
  for (const c of s.cells.slice(0, 6)) {
    const opp = s.cells.find((o) => o.branch === BRANCHES[(BRANCHES.indexOf(c.branch) + 6) % 12])!;
    const list = [...(map.get(c.palace) ?? []), ...(map.get(opp.palace) ?? [])];
    if (list.length >= 2) out.push({ pair: [c.palace, opp.palace], list });
  }
  return out;
}
const shaJiText = (map: Map<string, string[]>) =>
  map.size ? [...map].map(([palace, list]) => `${palace}（${list.join("、")}）`).join("；") : "沒有";

// 某天干的四化落在牌陣哪裡（主牌、副牌都算；身宮另列）
type Hit = { star: string; index: number; where: string[] };
function flyFrom(s: Spread, stem: string): Hit[] {
  return MUTAGENS[stem].map((star, index) => ({
    star,
    index,
    where: [
      ...s.cells.filter((c) => starsOf(c.main.name).includes(star) || starsOf(c.minor.name).includes(star)).map((c) => c.palace),
      ...(starsOf(s.body.name).includes(star) ? ["身宮"] : []),
    ],
  }));
}

function timeLabel(iso: string) {
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso.replaceAll("-", "/").replace(/\/0/g, "/");
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  const h = d.getHours();
  const shichen = TIMES[h === 23 ? 12 : Math.floor((h + 1) / 2)].split(" ")[0];
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()} ${pad(h)}:${pad(d.getMinutes())}（${shichen}）`;
}

function readLast(): Spread | null {
  try {
    const raw = localStorage.getItem(LAST_KEY);
    return raw ? (JSON.parse(raw) as Spread) : null;
  } catch {
    return null;
  }
}
function readDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    return raw ? (JSON.parse(raw) as Draft) : null;
  } catch {
    return null;
  }
}
function writeDraft(d: Draft | null) {
  try {
    if (d) localStorage.setItem(DRAFT_KEY, JSON.stringify(d));
    else localStorage.removeItem(DRAFT_KEY);
  } catch {
    // 不給存就算了
  }
}
function readSmall(): Small | null {
  try {
    const raw = localStorage.getItem(SMALL_KEY);
    return raw ? (JSON.parse(raw) as Small) : null;
  } catch {
    return null;
  }
}
function writeSmall(v: Small | null) {
  try {
    if (v) localStorage.setItem(SMALL_KEY, JSON.stringify(v));
    else localStorage.removeItem(SMALL_KEY);
  } catch {
    // 不給存就算了
  }
}
function writeLast(s: Spread | null) {
  try {
    if (s) localStorage.setItem(LAST_KEY, JSON.stringify(s));
    else localStorage.removeItem(LAST_KEY);
  } catch {
    // 不給存就算了
  }
}

// ---------- 畫面 ----------
// 盤面位置：巳午未申在上、亥子丑寅在下（和命盤一樣）
const POS: Record<string, [number, number]> = {
  巳: [1, 1], 午: [1, 2], 未: [1, 3], 申: [1, 4], 辰: [2, 1], 酉: [2, 4], 卯: [3, 1], 戌: [3, 4], 寅: [4, 1], 丑: [4, 2], 子: [4, 3], 亥: [4, 4],
};

// 牌色統一：正牌米色、倒牌藍灰；只有四煞用紅字紅框
// 點牌（onOpen）跳出牌卡大圖；牌在宮格按鈕裡，所以點牌不會同時點選那一宮（點宮名或空白處才點選）
function MiniCard({ card, tags, yearTags = [], fly = [], big = false, onOpen }: { card: Card; tags: number[]; yearTags?: number[]; fly?: number[]; big?: boolean; onOpen?: () => void }) {
  const sha = SHA.includes(card.name);
  const face = isReversed(card) ? "bg-mist-soft border-mist" : "bg-taupe-soft border-taupe";
  // 四煞、化忌紅字；祿存綠字
  const ink = sha ? "text-star-red border-star-red" : card.name === "祿存" ? "text-star-green border-star-green" : isReversed(card) ? "text-mist-deep" : "text-ink";
  return (
    <span className="flex flex-col items-center gap-1">
      <span
        className={`relative flex items-center justify-center rounded-[5px] border ${face} ${ink} ${big ? "h-[88px] w-[52px] text-xl" : "h-[58px] w-[33px] text-[14px]"} leading-none font-medium ${onOpen ? "cursor-pointer" : ""}`}
        title={cardText(card)}
        role={onOpen ? "button" : undefined}
        tabIndex={onOpen ? 0 : undefined}
        aria-label={onOpen ? `${cardText(card)}，看牌卡大圖` : undefined}
        onClick={
          onOpen
            ? (e) => {
                e.stopPropagation();
                onOpen();
              }
            : undefined
        }
        onKeyDown={
          onOpen
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onOpen();
                }
              }
            : undefined
        }
      >
        {/* 字一個一個直排；倒牌像實體牌整組轉 180 度（字倒過來、上下順序也顛倒），不另外寫正／倒 */}
        <span className={`flex flex-col items-center gap-0.5 ${isReversed(card) ? "rotate-180" : ""}`}>
          {[...card.name].map((ch, i) => (
            <span key={i}>{ch}</span>
          ))}
        </span>
        {/* 點選宮的宮干飛化：小方塊掛在牌的右上角外（像通知角標），牌面不讓位；倒牌也保持正向 */}
        {fly.length > 0 && (
          <span aria-label={`飛化${fly.map((i) => MUTAGEN_NAMES[i]).join("")}`} className="absolute -top-1.5 -right-1.5 z-10 flex gap-px">
            {fly.map((i) => (
              <span key={i} className={`rounded-[3px] px-[2px] py-px text-[10px] leading-none font-medium text-paper-light shadow-[0_0_0_1.5px_#fffdfa] ${MUTAGEN_FILL[i]}`}>
                {MUTAGEN_NAMES[i]}
              </span>
            ))}
          </span>
        )}
      </span>
      {/* 四化標記：三個以內排同一排（每個 12px 寬），再多才換行 */}
      <span className={`flex flex-wrap justify-center gap-px text-[10px] leading-none ${big ? "w-[52px]" : "w-[39px]"} ${tags.length + yearTags.length ? "" : "hidden"}`}>
        {/* 取數干四化：實心；年干四化：外框 */}
        {tags.map((i) => (
          <span key={i} className={`rounded-[3px] border border-transparent px-0 text-paper-light ${MUTAGEN_FILL[i]}`}>
            {MUTAGEN_NAMES[i]}
          </span>
        ))}
        {yearTags.map((i) => (
          <span key={`y${i}`} className={`rounded-[3px] border px-0 ${MUTAGEN_TEXT[i]} ${MUTAGEN_BORDER[i]}`}>
            {MUTAGEN_NAMES[i]}
          </span>
        ))}
      </span>
    </span>
  );
}

// 盤面自動縮放：整張盤塞進手機一個畫面（寬、高都不超出），轉向或視窗改變時重算
function FitBoard({ children, watch, fresh }: { children: ReactNode; watch: unknown; fresh: boolean }) {
  const outer = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ scale: number; height: number } | null>(null);
  useLayoutEffect(() => {
    const measure = () => {
      const o = outer.current, i = inner.current;
      if (!o || !i) return;
      const w = i.offsetWidth, h = i.offsetHeight;
      if (!w || !h) return;
      const avail = Math.max(320, window.innerHeight - 12);
      const scale = Math.min(1, o.clientWidth / w, avail / h);
      setFit((f) => (f && Math.abs(f.scale - scale) < 0.005 && f.height === h ? f : { scale, height: h }));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (inner.current) ro.observe(inner.current);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, []);
  // 剛抽完（換了一盤）就把整張盤捲到畫面頂端
  const first = useRef(true);
  useLayoutEffect(() => {
    if (first.current && !fresh) {
      first.current = false;
      return;
    }
    first.current = false;
    outer.current?.scrollIntoView({ block: "start" });
  }, [watch, fresh]);
  const scale = fit?.scale ?? 1;
  return (
    <div ref={outer} className="w-full scroll-mt-1 overflow-hidden" style={fit ? { height: fit.height * scale } : undefined}>
      <div ref={inner} style={{ transform: scale < 1 ? `scale(${scale})` : undefined, transformOrigin: "top center" }}>
        {children}
      </div>
    </div>
  );
}

// 說明裡的一段：每個四化一行；不在盤上的淡灰字；飛回自己這宮標「自化」
function InfoBlock({ title, hits, lyt, lytTitle, self, tone = "text-ink" }: { title: string; hits: Hit[]; lyt?: string[]; lytTitle?: string; self?: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className={tone}>{title}</span>
      {hits.map((h) => (
        <span key={h.index} className="flex gap-1.5">
          <span className={`shrink-0 ${MUTAGEN_TEXT[h.index]}`}>
            {h.star}化{MUTAGEN_NAMES[h.index]}
          </span>
          {h.where.length ? (
            <span className="text-ink">→ {h.where.map((w) => (w === self ? `${w}（自化）` : w)).join("、")}</span>
          ) : (
            <span className="text-ink-soft/50">→ 不在盤上</span>
          )}
        </span>
      ))}
      {lyt && (
        <>
          <span className={`mt-1 ${tone}`}>{lytTitle}</span>
          {LYT.map((name, i) => (
            <span key={name} className="text-ink">
              {name} → {lyt[i]}
            </span>
          ))}
        </>
      )}
    </div>
  );
}

export function SpreadView({
  mcp,
  people,
  initial,
  onSaved,
  onBack,
}: {
  mcp: Mcp | null;
  people: GuaPerson[];
  initial: Spread | null;
  onSaved: (caseId: string) => void;
  onBack?: () => void;
}) {
  const fromCase = !!initial;
  const own = people.find((p) => p.group === "自己") ?? people[0];
  const [personPick, setPersonPick] = useState<string | null>(null); // null＝還沒選，用預設
  const personId = personPick ?? own?.id ?? "";
  const [kind, setKind] = useState<Spread["kind"]>(initial?.kind ?? "問事");
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [year, setYear] = useState(initial?.year || String(new Date().getFullYear()));
  const [manual, setManual] = useState(false);
  const [inputs, setInputs] = useState<[string, string]>(["", ""]);
  const cleanNum = (v: string) => v.trim().replace(/^0+(?=\d)/, "");
  const validNums = inputs.every((v) => /^\d+$/.test(v.trim()));
  const validFirst = /^\d+$/.test(inputs[0].trim()); // 小牌型只用數一定天干
  const [spread, setSpread] = useState<Spread | null>(() => initial ?? readLast());
  const [selected, setSelected] = useState<string | null>(null);
  const [showYear, setShowYear] = useState(false);
  const [showDraw, setShowDraw] = useState(false); // 取數干四化與祿羊陀：和年干一樣按了才出現
  const [justDrew, setJustDrew] = useState(false); // 剛按抽牌陣（重開舊盤不自動捲動）
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [savedId, setSavedId] = useState<string | null>(fromCase ? "" : (initial ?? readLast())?.saved ?? null);
  const [confirmReset, setConfirmReset] = useState(false);
  const [zoom, setZoom] = useState<{ card: Card; palace?: string } | null>(null); // 點牌看大圖
  const [gallery, setGallery] = useState(false); // 圖卡全螢幕
  const [handPick, setHandPick] = useState(false); // 牌：電腦隨機／手動選牌
  const [draft, setDraftState] = useState<Draft | null>(() => (initial ? null : readDraft()));
  const [confirmDrop, setConfirmDrop] = useState(false);
  // 牌型：十二宮（原本的牌陣）或小牌型；小牌型目前這盤另外記
  const [layoutPick, setLayoutPick] = useState<"twelve" | LayoutId>("twelve");
  const [small, setSmallState] = useState<Small | null>(() => (initial ? null : readSmall()));
  const setSmall = (v: Small | null) => {
    setSmallState(v);
    writeSmall(v);
  };
  const isSmall = layoutPick !== "twelve";
  // 小牌型可以不取數（不定天干，只看年干四化）；預設不取數，十二宮一定要取數
  const [noNum, setNoNum] = useState(true);
  const skipNum = isSmall && noNum;
  const setDraft = (d: Draft | null) => {
    setDraftState(d);
    writeDraft(d);
  };
  const person = people.find((p) => normId(p.id) === normId(personId)) ?? null;
  const groups = [...new Set(people.map((p) => p.group))];
  const validYear = /^\d{4}$/.test(year.trim());

  function draw() {
    if (layoutPick !== "twelve") {
      // 小牌型：只取數天干（數一 ÷10）；牌電腦抽或手動選
      const useManual = manual && !skipNum;
      const base = deal(kind, question.trim(), year.trim(), useManual ? [cleanNum(inputs[0]), cleanNum(inputs[1]) || "0"] : null);
      setSmall(
        newSmall(
          layoutPick,
          { stem: skipNum ? "" : base.stem, life: base.life, kind: base.kind, question: base.question, year: base.year, at: base.at, ...(useManual ? { nums: [cleanNum(inputs[0]), ""] as [string, string] } : {}) },
          handPick,
        ),
      );
      setMessage("");
      return;
    }
    const next = deal(kind, question.trim(), year.trim(), manual ? [cleanNum(inputs[0]), cleanNum(inputs[1])] : null);
    if (handPick) {
      // 手動選牌：取數照常（定天干、命宮、宮干），牌全部留空給本人選
      setDraft({ ...next, cells: next.cells.map((c) => ({ ...c, main: null, minor: null })), body: null, stage: null });
      setMessage("");
      return;
    }
    setSpread(next);
    setJustDrew(true);
    writeLast(next);
    setSelected(null);
    setShowYear(false);
    setShowDraw(false);
    setSavedId(null);
    setMessage("");
  }
  // 手動選牌選滿 26 張 → 變成一般的牌陣（可看四化、煞忌、存案例）
  function finishPick() {
    if (!draft || pickedCount(draft) < 26) return;
    const next: Spread = {
      ...draft,
      cells: draft.cells.map((c) => ({ ...c, main: c.main!, minor: c.minor! })),
      body: draft.body!,
      stage: draft.stage!,
      hand: true,
    };
    setDraft(null);
    setSpread(next);
    setJustDrew(true);
    writeLast(next);
    setSelected(null);
    setShowYear(false);
    setShowDraw(false);
    setSavedId(null);
    setMessage("");
  }
  // 還沒存的手選盤可以回去改牌
  function editPick() {
    if (!spread) return;
    const { hand: _hand, saved: _saved, ...rest } = spread;
    setDraft(rest);
    setSpread(null);
    writeLast(null);
    setSelected(null);
  }
  function reset() {
    setDraft(null);
    setSpread(null);
    writeLast(null);
    setSelected(null);
    setSavedId(null);
    setMessage("");
  }

  // 取數干：抽到的天干；年干：實際年份的天干（兩個都按了才顯示）
  const drawHits = spread ? flyFrom(spread, spread.stem) : [];
  const yearGZ = spread && /^\d{4}$/.test(spread.year) ? yearGanzhi(Number(spread.year)) : "";
  const yearHits = yearGZ ? flyFrom(spread!, yearGZ[0]) : [];
  const hitsOn = (hits: Hit[], card: Card) => hits.filter((h) => starsOf(card.name).includes(h.star)).map((h) => h.index);
  const tagsFor = (card: Card) => (showDraw ? hitsOn(drawHits, card) : []);
  const yearTagsFor = (card: Card) => (showYear ? hitsOn(yearHits, card) : []);
  // 祿存、擎羊、陀羅所在宮：取數干一組、年干一組
  const lytOf = (stem: string) => (spread ? luYangTuo(stem).map((b) => spread.cells.find((c) => c.branch === b)!.palace) : []);
  const drawLyt = spread ? lytOf(spread.stem) : [];
  const yearLyt = yearGZ ? lytOf(yearGZ[0]) : [];
  const selCell = spread?.cells.find((c) => c.palace === selected) ?? null;
  const flying = spread && selCell ? flyFrom(spread, selCell.stem) : [];
  const selLyt = selCell ? lytOf(selCell.stem) : [];
  // 煞忌兩個以上：牌一律算；取數干、年干各自按了才算進去，點選宮的宮干（羊、陀、飛化忌）也算
  const drawLayer: Layer = { tag: "取數", lyt: drawLyt, ji: drawHits[3] };
  const yearLayer: Layer = { tag: "年", lyt: yearLyt, ji: yearHits[3] };
  const selLayer: Layer | null = selCell ? { tag: `${selCell.palace}干`, lyt: selLyt, ji: flying[3] } : null;
  const rawShaJi = spread
    ? shaJiMap(spread, [...(showDraw ? [drawLayer] : []), ...(showYear && yearGZ ? [yearLayer] : []), ...(selLayer ? [selLayer] : [])])
    : new Map<string, string[]>();
  const shaJi = atLeastTwo(rawShaJi);
  // 兩個都沒按：改看對宮線（只算牌），同一條線兩顆以上就兩宮都圈
  const axisMode = !showDraw && !showYear && !selCell;
  // 對宮線紅點一律只算牌，按了取數干／年干也照樣留著
  const axes = spread ? axisMap(spread, shaJiMap(spread, [])) : [];
  const dotted = new Set(axes.flatMap((a) => a.pair));
  const numText = (sp: Spread) =>
    sp.nums
      ? `手動輸入 ${sp.nums[0]}、${sp.nums[1]}（${sp.nums[0]} ÷ 10 餘 ${BigInt(sp.nums[0]) % 10n} → ${sp.stem}；${sp.nums[1]} ÷ 12 餘 ${BigInt(sp.nums[1]) % 12n} → 命宮${sp.life}）`
      : "電腦隨機";
  const lytText = (where: string[]) => LYT.map((name, i) => `${name}→${where[i]}`).join("、");
  const flyFor = (card: Card) => flying.filter((h) => starsOf(card.name).includes(h.star)).map((h) => h.index);

  const title = spread ? spread.question || (spread.kind === "年運" ? `${person?.name ? `${person.name} ` : ""}${spread.year} 年運` : "牌陣") : "";
  const yearLabel = yearGZ ? `年干 ${yearGZ}（${spread!.kind === "年運" ? "" : "農曆 "}${spread!.year}）` : "";
  const hitText = (hits: Hit[]) => hits.map((h) => `${h.star}化${MUTAGEN_NAMES[h.index]}→${h.where.length ? h.where.join("、") : "不在盤上"}`).join("；");

  async function save() {
    if (!mcp || !spread) return;
    setBusy(true);
    setMessage("");
    try {
      const lines = [
        `- 類型：${spread.kind === "年運" ? `年運（${spread.year}）` : "問事"}`,
        `- 取數天干：${spread.stem}　命宮在${spread.life}`,
        ...(person ? [`- 命盤：${person.name || "未命名"}`] : []),
        `- 抽牌時間：${timeLabel(spread.at)}`,
        `- 取數方式：${numText(spread)}`,
        `- 抽牌方式：${spread.hand ? "手動選牌" : "電腦隨機抽牌"}`,
        `- 取數干四化：${hitText(drawHits)}`,
        `- 取數干祿羊陀：${lytText(drawLyt)}`,
        ...(yearGZ ? [`- ${yearLabel}四化：${hitText(yearHits)}`, `- 年干祿羊陀：${lytText(yearLyt)}`] : []),
        `- 煞忌兩個以上（牌＋取數干${yearGZ ? "＋年干" : ""}）：${shaJiText(atLeastTwo(shaJiMap(spread, [drawLayer, ...(yearGZ ? [yearLayer] : [])])))}`,
        `- 對宮線煞忌兩顆以上（只算牌）：${axisMap(spread, shaJiMap(spread, [])).map((a) => `${a.pair.join("－")}（${a.list.join("、")}）`).join("；") || "沒有"}`,
      ];
      const board = [
        ...spread.cells.map((c) => `- **${c.palace}（${c.stem}${c.branch}）**：${cardText(c.main)}｜${cardText(c.minor)}　${c.stem}干飛：${hitText(flyFrom(spread, c.stem))}`),
        `- **身宮**：${cardText(spread.body)}　**長生**：${cardText(spread.stage)}`,
      ];
      // 牌陣和十二宮都寫成可收合的標題（十二宮收在牌陣裡面）
      const content = [
        `## 提問\n${title}`,
        toggleBlock(2, "牌陣", `${lines.join("\n")}\n${toggleBlock(3, "十二宮", board.join("\n"))}`),
        "## 第一版判斷\n",
        "## 討論修正\n",
      ].join("\n");
      const today = new Date(spread.at);
      const pad = (n: number) => String(n).padStart(2, "0");
      const result = await mcp.callTool(SERVER, "notion-create-pages", {
        parent: { data_source_id: CASE_SOURCE },
        pages: [
          {
            properties: {
              案例名稱: title,
              "date:日期:start": `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`,
              "date:日期:is_datetime": 0,
              ...(person ? { 命盤: [normId(person.id)] } : {}),
              牌組: spreadText(spread),
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
      setSavedId(id);
      writeLast({ ...spread, saved: id });
      setMessage("已存成案例。");
    } catch (e) {
      setMessage(explain(e as { code?: string; message?: string }) + "　如果案例清單裡已經出現，就是有存進去了。");
    }
    setBusy(false);
  }

  const chip = (on: boolean) => `rounded-full px-3 py-1 text-sm ${FOCUS} ${on ? "bg-wine text-paper-light" : "bg-paper hover:bg-line"}`;
  const LABEL = "text-sm tracking-widest text-ink-soft";

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-2 py-3 sm:px-6">
      {onBack && (
        <button type="button" onClick={onBack} className={`w-fit text-sm text-ink-soft underline underline-offset-4 ${FOCUS}`}>
          ← 回案例
        </button>
      )}
      {!spread && draft && (
        <section className="flex flex-col gap-2">
          <SpreadPicker draft={draft} onChange={setDraft} onDone={finishPick} title={draft.question || (draft.kind === "年運" ? `${draft.year} 年運` : "牌陣")} />
          {confirmDrop ? (
            <span role="alert" className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-apricot-soft px-3 py-2 text-sm text-apricot-deep">
              放棄這盤手選的牌，回到抽牌前？
              <button
                type="button"
                onClick={() => {
                  setConfirmDrop(false);
                  setDraft(null);
                }}
                className={`rounded-full bg-ink px-3 py-1 text-xs text-paper-light ${FOCUS}`}
              >
                確定放棄
              </button>
              <button type="button" onClick={() => setConfirmDrop(false)} className={`text-xs underline underline-offset-4 ${FOCUS}`}>
                取消
              </button>
            </span>
          ) : (
            <button type="button" onClick={() => (pickedCount(draft) ? setConfirmDrop(true) : setDraft(null))} className={`w-fit text-sm text-ink-soft underline underline-offset-4 ${FOCUS}`}>
              放棄選牌
            </button>
          )}
        </section>
      )}
      {!spread && !draft && small && (
        <SmallSpread
          value={small}
          onChange={setSmall}
          mcp={mcp}
          person={person}
          yearGZ={/^\d{4}$/.test(small.year) ? yearGanzhi(Number(small.year)) : ""}
          starsOf={starsOf}
          mutagens={MUTAGENS}
          numText={!small.stem ? "不取數" : small.nums ? `手動輸入 ${small.nums[0]}（${small.nums[0]} ÷ 10 餘 ${BigInt(small.nums[0]) % 10n} → ${small.stem}）` : "電腦隨機"}
          timeText={timeLabel(small.at)}
          onReset={() => setSmall(null)}
          onSaved={onSaved}
        />
      )}
      {!spread && !draft && !small && (
        <section className="flex flex-col gap-2.5 border border-line bg-paper-light p-4">
          <div role="group" aria-label="牌型" className="grid grid-cols-4 overflow-hidden rounded-full border border-line">
            {(["three", "body", "mq", "twelve"] as const).map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={layoutPick === id}
                onClick={() => setLayoutPick(id)}
                className={`px-0.5 py-1.5 text-xs whitespace-nowrap ${FOCUS} ${layoutPick === id ? "bg-ink text-paper-light" : "text-ink-soft"}`}
              >
                {id === "twelve" ? "十二宮" : SMALL_NAMES[id]}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <span className={`${LABEL} mr-1`}>問什麼</span>
            {(["問事", "年運"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={chip(kind === k)}>
                {k}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
            {kind === "年運" && (
              <>
                <label htmlFor="spread-year" className={LABEL}>
                  年份
                </label>
                <input id="spread-year" inputMode="numeric" value={year} onChange={(e) => setYear(e.target.value)} className={`${INPUT} w-28 py-1.5`} />
              </>
            )}
            <label htmlFor="spread-q" className={LABEL}>
              問題
            </label>
            <input
              id="spread-q"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={kind === "年運" ? "可不填（存案例時當名稱）" : "想問什麼（存案例時當名稱）"}
              className={`${INPUT} py-1.5`}
            />
            <label htmlFor="spread-person" className={LABEL}>
              命盤
            </label>
            <select id="spread-person" value={personId} onChange={(e) => setPersonPick(e.target.value)} className={`${INPUT} py-1.5`}>
              <option value="">不連結</option>
              {groups.map((g) => (
                <optgroup key={g} label={g}>
                  {people
                    .filter((p) => p.group === g)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name || "未命名"}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`${LABEL} mr-1`}>取數</span>
            {isSmall && (
              <button type="button" aria-pressed={skipNum} onClick={() => setNoNum(true)} className={chip(skipNum)}>
                不取數
              </button>
            )}
            {([false, true] as const).map((m) => (
              <button
                key={String(m)}
                type="button"
                aria-pressed={!skipNum && manual === m}
                onClick={() => {
                  setNoNum(false);
                  setManual(m);
                }}
                className={chip(!skipNum && manual === m)}
              >
                {m ? "手動輸入" : "電腦隨機"}
              </button>
            ))}
          </div>
          {manual && !skipNum && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              {(isSmall ? [0] : [0, 1]).map((i) => (
                <input
                  key={i}
                  id={`spread-num-${i}`}
                  aria-label={i === 0 ? "數一（取數天干）" : "數二（命宮地支）"}
                  inputMode="numeric"
                  value={inputs[i]}
                  onChange={(e) => setInputs(i === 0 ? [e.target.value, inputs[1]] : [inputs[0], e.target.value])}
                  placeholder={i === 0 ? "數一→天干" : "數二→命宮"}
                  className={`${INPUT} w-28 py-1.5`}
                />
              ))}
              <span className="text-xs text-ink-soft">{isSmall ? "數一 ÷10 定天干" : "數一 ÷10 定天干、數二 ÷12 定命宮"}</span>
            </div>
          )}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`${LABEL} mr-1`}>牌</span>
            {([false, true] as const).map((m) => (
              <button key={String(m)} type="button" aria-pressed={handPick === m} onClick={() => setHandPick(m)} className={chip(handPick === m)}>
                {m ? "手動選牌" : "電腦隨機"}
              </button>
            ))}
          </div>
          <button type="button" disabled={(kind === "年運" && !validYear) || (manual && !skipNum && !(isSmall ? validFirst : validNums))} onClick={draw} className={`${BUTTON_PRIMARY} mt-1 py-2.5`}>
            {handPick ? "開始選牌" : "抽牌"}
          </button>
          <p className="text-center text-xs text-ink-soft">
            {isSmall
              ? `${SMALL_NAMES[layoutPick as LayoutId]}：${layoutPick === "three" ? "主星｜輔星｜長生，可再加組" : layoutPick === "body" ? "主星｜輔星｜長生＋身宮" : "命宮、遷移各一主一輔＋長生"}；${skipNum ? "不取數，可看年干四化" : "取數定天干，可看取數干、年干四化"}${handPick ? "；點一格、從下面選牌，選滿才能存" : ""}`
              : handPick
                ? "取數定天干和命宮後，盤面是空的：點一格、從下面選牌，同一張牌一陣只能用一次；選滿 26 張才能完成"
                : "取數天干和命宮用電腦隨機或手動數字；牌由電腦隨機抽，每宮一張主牌＋一張副牌，中央身宮＋長生"}
          </p>
        </section>
      )}

      {spread && (
        <>
          <FitBoard watch={spread.at} fresh={justDrew}>
          <div data-board className="grid grid-cols-4 grid-rows-[repeat(4,auto)] gap-px border border-line bg-line">
            {spread.cells.map((c) => {
              const [row, col] = POS[c.branch];
              const isSel = selected === c.palace;
              return (
                <button
                  key={c.palace}
                  type="button"
                  aria-pressed={isSel}
                  onClick={() => setSelected(isSel ? null : c.palace)}
                  style={{ gridRow: row, gridColumn: col }}
                  className={`relative flex min-w-0 flex-col items-center gap-1.5 px-1 pt-1.5 pb-2.5 ${SANFANG_BG[c.palace] ?? "bg-paper-light"} ${FOCUS} ${isSel ? "ring-2 ring-wine ring-inset" : ""}`}
                >

                  <span className="flex w-full items-baseline justify-between px-0.5 text-[11px] leading-none">
                    {/* 煞忌標記放宮名旁：對宮線兩顆以上的兩宮各一個紅點（一律只算牌）；有按取數干／年干時，單宮兩個以上再加一個寫數字的紅點 */}
                    <span className="flex items-center gap-0.5">
                      <span className={c.palace === "命宮" ? "font-medium text-wine" : "text-ink"}>{c.palace}</span>
                      {dotted.has(c.palace) && <span aria-label="對宮線煞忌" className="inline-block h-2 w-2 rounded-full bg-star-red" />}
                      {!axisMode && shaJi.has(c.palace) && (
                        <span aria-label={`煞忌${shaJi.get(c.palace)!.length}`} className="inline-flex h-[13px] min-w-[13px] items-center justify-center rounded-full bg-star-red px-[2px] text-[9px] leading-none text-paper-light">
                          {shaJi.get(c.palace)!.length}
                        </span>
                      )}
                    </span>
                    <span className="text-ink-soft">
                      {c.stem}
                      {c.branch}
                    </span>
                  </span>
                  <span className="mt-1.5 flex gap-1">
                    <MiniCard card={c.main} tags={tagsFor(c.main)} yearTags={yearTagsFor(c.main)} fly={flyFor(c.main)} onOpen={() => setZoom({ card: c.main, palace: c.palace })} />
                    <MiniCard card={c.minor} tags={tagsFor(c.minor)} yearTags={yearTagsFor(c.minor)} fly={flyFor(c.minor)} onOpen={() => setZoom({ card: c.minor, palace: c.palace })} />
                  </span>
                  {/* 祿羊陀：取數干、年干、點選宮的宮干放同一排，靠格子右下；取數干／年干實色塊（年干寫「年」），宮干用外框 */}
                  {((showDraw && drawLyt.includes(c.palace)) || (showYear && yearLyt.includes(c.palace)) || selLyt.includes(c.palace)) && (
                    <span className="mt-auto flex flex-wrap justify-end gap-0.5 self-end text-[10px] leading-none">
                      {showDraw &&
                        drawLyt.map((w, i) =>
                          w === c.palace ? (
                            <span key={i} className={`rounded-[3px] border px-[3px] py-px text-paper-light ${i === 0 ? "border-star-green bg-star-green" : "border-wine bg-wine"}`}>
                              {LYT_SHORT[i]}
                            </span>
                          ) : null,
                        )}
                      {showYear &&
                        yearLyt.map((w, i) =>
                          w === c.palace ? (
                            <span key={`y${i}`} className={`rounded-[3px] border px-[2px] py-px text-paper-light ${i === 0 ? "border-star-green bg-star-green" : "border-wine bg-wine"}`}>
                              年{LYT_SHORT[i]}
                            </span>
                          ) : null,
                        )}
                      {selLyt.map((w, i) =>
                        w === c.palace ? (
                          <span key={`s${i}`} aria-label={`宮干${LYT[i]}`} className={`rounded-[3px] border bg-paper-light px-[3px] py-px ${i === 0 ? "border-star-green text-star-green" : "border-wine text-wine"}`}>
                            {LYT_SHORT[i]}
                          </span>
                        ) : null,
                      )}
                    </span>
                  )}
                </button>
              );
            })}
            <div style={{ gridRow: "2 / 4", gridColumn: "2 / 4" }} className="flex flex-col items-center justify-between gap-2 bg-paper px-2 py-3">
              <span className="line-clamp-2 text-center text-xs text-ink">{title}</span>
              <div className="flex items-end gap-4">
                <span className="flex flex-col items-center gap-0.5">
                  <span className="text-[10px] text-ink-soft">身宮</span>
                  <MiniCard card={spread.body} tags={tagsFor(spread.body)} yearTags={yearTagsFor(spread.body)} fly={flyFor(spread.body)} big onOpen={() => setZoom({ card: spread.body })} />
                </span>
                <span className="flex flex-col items-center gap-0.5">
                  <span className="text-[10px] text-ink-soft">長生</span>
                  <MiniCard card={spread.stage} tags={[]} big onOpen={() => setZoom({ card: spread.stage })} />
                </span>
              </div>
              <span className="flex flex-col items-center gap-1 text-center text-[10px] leading-tight text-ink-soft">
                <span>
                  {timeLabel(spread.at)}
                </span>
                {/* 兩顆並排，只寫「取數干」「年干」；按下去變實心＝顯示中 */}
                <span className="flex gap-1.5">
                  <button
                    type="button"
                    aria-pressed={showDraw}
                    aria-label="取數干"
                    onClick={() => setShowDraw(!showDraw)}
                    className={`rounded-full border border-ink px-2.5 py-0.5 text-[11px] ${FOCUS} ${showDraw ? "bg-ink text-paper-light" : "text-ink"}`}
                  >
                    取{spread.stem}
                  </button>
                  {yearGZ && (
                    <button
                      type="button"
                      aria-pressed={showYear}
                      aria-label="年干"
                      onClick={() => setShowYear(!showYear)}
                      className={`rounded-full border border-wine px-2.5 py-0.5 text-[11px] ${FOCUS} ${showYear ? "bg-wine text-paper-light" : "text-wine"}`}
                    >
                      年{yearGZ[0]}
                    </button>
                  )}
                </span>
              </span>
            </div>
          </div>
          </FitBoard>

          {/* 圖卡：全螢幕小圖盤；點牌看大圖 */}
          <div className="-mt-2 flex items-center justify-between gap-2">
            <span className="text-xs text-ink-soft">點牌看牌卡大圖・點宮名或空白處看飛化</span>
            <button type="button" onClick={() => setGallery(true)} className={`rounded-full bg-ink px-3.5 py-1 text-[13px] text-paper-light ${FOCUS}`}>
              圖卡
            </button>
          </div>
          {zoom && (
            <CardZoom
              card={zoom.card}
              palace={zoom.palace}
              selected={!!zoom.palace && selected === zoom.palace}
              onSelect={
                zoom.palace
                  ? () => {
                      setSelected(selected === zoom.palace ? null : zoom.palace!);
                      setZoom(null);
                    }
                  : undefined
              }
              onClose={() => setZoom(null)}
            />
          )}
          {gallery && <CardGallery cells={spread.cells} body={spread.body} stage={spread.stage} onClose={() => setGallery(false)} />}

          {/* 說明：整塊可收合，預設收起；每個四化一行，不在盤上的用淡灰字 */}
          <details className="group rounded-xl bg-paper-light px-3 py-2 text-xs text-ink-soft">
            <summary className={`cursor-pointer list-none py-0.5 text-sm text-ink [&::-webkit-details-marker]:hidden ${FOCUS}`}>
              <span aria-hidden className="mr-1.5 inline-block text-xs text-ink-soft transition-transform group-open:rotate-90">
                ▸
              </span>
              說明
              <span className="ml-1.5 text-xs text-ink-soft">
                {selCell ? `四化・祿羊陀・${selCell.palace}飛化` : "四化・祿羊陀・點一宮看飛化"}
              </span>
            </summary>
            <div className="mt-2 flex flex-col gap-3">
              <div className="flex flex-col gap-0.5">
                <span className="text-star-red">對宮線煞忌兩顆以上（兩宮宮名旁紅點）</span>
                {axes.length ? (
                  axes.map((a) => (
                    <span key={a.pair[0]} className="text-ink">
                      {a.pair.join("－")}：{a.list.join("、")}
                    </span>
                  ))
                ) : (
                  <span>沒有</span>
                )}
                <span className="text-ink-soft/70">只算四煞牌、化忌牌，看同一條對宮線的兩宮合起來</span>
                {!axisMode && (
                  <>
                    <span className="mt-2 text-star-red">煞忌兩個以上（宮名旁紅點數字）</span>
                    {shaJi.size ? (
                      [...shaJi].map(([palace, list]) => (
                        <span key={palace} className="text-ink">
                          {palace}：{list.join("、")}
                        </span>
                      ))
                    ) : (
                      <span>沒有</span>
                    )}
                    <span className="text-ink-soft/70">算這一宮的四煞牌、化忌牌，加上有按開的取數干、年干，以及點選那宮宮干的擎羊、陀羅、化忌</span>
                  </>
                )}
              </div>
              {showDraw && <InfoBlock title={`取數干 ${spread.stem} 四化`} hits={drawHits} lyt={drawLyt} lytTitle="取數干祿羊陀" />}
              {!showDraw && !showYear && <p>取數干、年干的四化和祿羊陀，按盤中央的「取數干」「年干」才會出現。</p>}
              {showYear && yearGZ && <InfoBlock title={`${yearLabel}四化`} hits={yearHits} lyt={yearLyt} lytTitle="年干祿羊陀" tone="text-wine" />}
              {selCell ? (
                <InfoBlock
                  title={`${selCell.palace}（${selCell.stem}${selCell.branch}）飛化`}
                  hits={flying}
                  self={selCell.palace}
                  lyt={selLyt}
                  lytTitle={`${selCell.palace}宮干祿羊陀`}
                  tone="text-wine"
                />
              ) : (
                <p>點盤上任一宮，這裡會列出該宮宮干的飛化。</p>
              )}
              {/* 盤的圖例 */}
              <div className="flex flex-col gap-1 rounded-lg border border-line px-2.5 py-2">
                <span className="text-ink">盤的說明</span>
                <span>杏色底＝命宮三方四正（命宮較深）</span>
                <span>米色正字＝正牌・藍灰倒字＝倒牌・紅字＝四煞與化忌・綠字＝祿存</span>
                <span>牌下四化：實心＝取數干・外框＝年干</span>
                <span>存（綠）／羊／陀＝祿存、擎羊、陀羅，同一排放格子右下：實色塊＝取數干（年存＝年干的），外框＝點選那宮的宮干</span>
                <span>牌右上角掛的祿權科忌＝點選那宮飛到這張牌的四化</span>
                <span>宮名旁紅點＝對宮線煞忌兩顆以上的兩宮（只算牌）</span>
                <span>宮名旁紅點數字＝有按取數干／年干或點選一宮時，這宮煞忌幾個（兩個以上才標）</span>
              </div>
            </div>
          </details>

          {/* 複製牌組文字給小P：第一行抽牌時間＋問題，第二行和案例牌組欄同一種寫法 */}
          <CopyBox text={`${shortTime(spread.at)} 十二宮牌陣${spread.question ? `｜${spread.question}` : ""}\n${spreadText(spread)}`} clamp />

          <div className="flex flex-wrap items-center gap-3">
            {!fromCase && mcp && (
              <button type="button" disabled={busy || savedId !== null} onClick={save} className={`${BUTTON_GHOST} bg-paper-light px-5 py-2`}>
                {busy ? "存檔中…" : savedId !== null ? "已存成案例" : "存成案例"}
              </button>
            )}
            {savedId && (
              <button type="button" onClick={() => onSaved(savedId)} className={`text-sm underline underline-offset-4 ${FOCUS}`}>
                到案例看 →
              </button>
            )}
            {!fromCase && spread.hand && savedId === null && (
              <button type="button" onClick={editPick} className={`text-sm text-ink-soft underline underline-offset-4 ${FOCUS}`}>
                改牌
              </button>
            )}
            {!fromCase && (
              <button
                type="button"
                onClick={() => (savedId === null ? setConfirmReset(true) : reset())}
                className={`text-sm text-ink-soft underline underline-offset-4 ${FOCUS}`}
              >
                重新抽
              </button>
            )}
            {/* 還沒存的盤，重抽前先確認（畫面上確認，不用跳出視窗） */}
            {confirmReset && (
              <span role="alert" className="flex w-full flex-wrap items-center gap-2 rounded-lg bg-apricot-soft px-3 py-2 text-sm text-apricot-deep">
                這盤還沒存，確定要重抽嗎？
                <button
                  type="button"
                  onClick={() => {
                    setConfirmReset(false);
                    reset();
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
            {message && <span className="text-xs text-ink-soft">{message}</span>}
          </div>
        </>
      )}
    </div>
  );
}
