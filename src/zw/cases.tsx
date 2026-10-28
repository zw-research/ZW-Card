import { useCallback, useEffect, useState, type ReactNode } from "react";
import { cardThumb } from "./cardImages";
import { CardZoom } from "./cardView";
import { CARD_CATEGORY, CATEGORIES, SLOTS, fixOrient, hasOrient, isReversed, orientMark } from "./cards";
import { randomIndex } from "./draw";
import { isSpreadText, parseSpreadText } from "./spread";
import { starPageUrl } from "./stars";
import { BUTTON_GHOST, BUTTON_PRIMARY, FOCUS, INPUT, TONES } from "./ui";

// ---------- Notion：紫微斗數 / ZW 案例資料庫 ----------
const SERVER = "Notion";
const DATA_SOURCE = "3a1eb16a-24f4-80aa-bb7c-000b6f53edb4";
// 「網頁用・全部案例」檢視（日期新到舊）；用檢視讀取不佔查詢額度
const VIEW = "view://3faeb16a-24f4-812c-a293-000c27362e7e";

// 讀不到資料庫設定時的備用選項；正常會從 Notion 讀最新的選項
const FALLBACK = {
  類型: ["找物", "找人", "搬家", "健康", "家庭", "感情", "工作", "居家"],
  關鍵字: [] as string[],
  狀態: ["待驗證", "討論中", "已驗證"],
  驗證: ["未知", "符合", "部分符合", "不符合"],
};
type Options = typeof FALLBACK;

const STATUS_STYLE: Record<string, string> = {
  待驗證: "bg-[#efe4d6] text-taupe-deep",
  討論中: "bg-mist-soft text-mist-deep",
  已驗證: "bg-[#e3eee0] text-moss",
};
const VERIFY_STYLE: Record<string, string> = {
  未知: "bg-gold-soft text-gold-deep",
  符合: "bg-[#f6e1e6] text-wine",
  部分符合: "bg-apricot-soft text-apricot-deep",
  不符合: "bg-paper text-ink-soft",
};
// 送進 Notion 的圖片：包成 SVG 的文字檔，上限 200 KiB，留一點餘裕
const MAX_IMAGE_CHARS = 190_000;

type McpError = { code?: string; message?: string };
export type Mcp = {
  callTool: (server: string, tool: string, input?: unknown, options?: unknown) => Promise<{ payload?: unknown }>;
};
export type PersonRef = { id: string; name: string; group: string };

export type Case = {
  id: string;
  url: string;
  title: string;
  date: string;
  personId: string | null;
  who: string;
  type: string;
  keywords: string[];
  status: string;
  verify: string;
  track: boolean;
  trackUntil: string;
  cards: string;
  gua: string;
  guaAt: string;
};

type CaseInput = {
  title: string;
  date: string;
  personId: string | null;
  who: string;
  type: string;
  keywords: string[];
  status: string;
  verify: string;
  track: boolean;
  trackUntil: string;
  cards: string;
  drawn: boolean; // 這次是電腦隨機抽的（存檔時在內文記一行，之後牌組鎖住）
  analysis: string;
  files: File[];
};

// 電腦隨機抽的牌：內文「## 牌組」底下記這一行（抽牌方式的紀錄）；存檔後的牌組一律鎖住，手選的也一樣
const DRAWN_MARK = "電腦隨機抽牌";

export const normId = (value: string) => (value || "").split("/").pop()!.split("?")[0].replaceAll("-", "").toLowerCase();

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value !== "string" || !value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function toCase(row: Record<string, unknown>): Case {
  const url = String(row.url ?? "");
  const people = parseList(row["命盤"]);
  return {
    id: normId(url),
    url,
    title: String(row["案例名稱"] ?? "") || "（未命名案例）",
    date: String(row["date:日期:start"] ?? "").slice(0, 10),
    personId: people.length ? normId(people[0]) : null,
    who: String(row["對象"] ?? ""),
    type: String(row["類型"] ?? ""),
    keywords: parseList(row["關鍵字"]),
    status: String(row["狀態"] ?? ""),
    verify: String(row["驗證"] ?? ""),
    track: row["可追蹤"] === "__YES__",
    trackUntil: String(row["date:可追蹤期限:start"] ?? "").slice(0, 10),
    cards: String(row["牌組"] ?? ""),
    gua: String(row["卦"] ?? ""),
    guaAt: String(row["date:卦時間:start"] ?? ""),
  };
}

export function explain(error: McpError) {
  switch (error?.code) {
    case "needs_reauth":
      return "Notion 連線過期了，到 claude.ai 的「設定 → 連接器」重新連接 Notion。";
    case "not_in_manifest":
    case "consent_required":
      return "這頁還沒被允許使用 Notion 的這個功能，從頁面上方的權限選單打開後重新整理。";
    case "server_unavailable":
      return "Notion 暫時沒有回應，稍後再試一次。";
    case "tool_error":
      return "Notion 回報錯誤：" + (error.message ?? "");
    default:
      return "連 Notion 失敗：" + (error?.message ?? "未知錯誤");
  }
}

function today() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function shortDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year) return "未填日期";
  return `${year}/${month}/${day}`;
}

function stampNow() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function fetchText(payload: unknown) {
  return typeof payload === "string" ? payload : String((payload as { text?: unknown } | undefined)?.text ?? "");
}

function pageContent(payload: unknown) {
  const match = fetchText(payload).match(/<content>\n?([\s\S]*?)\n?<\/content>/);
  return match ? match[1] : "";
}

// 從資料庫設定讀出各個選單目前的選項（小P 新增的也會跟著出現）
function readOptions(payload: unknown): Options | null {
  const match = fetchText(payload).match(/<data-source-state>\s*([\s\S]*?)\s*<\/data-source-state>/);
  if (!match) return null;
  try {
    const schema = JSON.parse(match[1]).schema as Record<string, { options?: { name: string }[] }>;
    const names = (key: keyof Options) => schema[key]?.options?.map((option) => option.name) ?? FALLBACK[key];
    return { 類型: names("類型"), 關鍵字: names("關鍵字"), 狀態: names("狀態"), 驗證: names("驗證") };
  } catch {
    return null;
  }
}

// ---------- 圖片：壓縮成 JPEG，包進 SVG 文字檔再交給 Notion ----------
async function imageToSvg(file: Blob): Promise<string> {
  const bitmap = await createImageBitmap(file);
  let side = Math.min(1800, Math.max(bitmap.width, bitmap.height));
  let quality = 0.82;
  for (let attempt = 0; attempt < 12; attempt++) {
    const scale = side / Math.max(bitmap.width, bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    const dataUrl = canvas.toDataURL("image/jpeg", quality);
    if (dataUrl.length <= MAX_IMAGE_CHARS) {
      bitmap.close();
      return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><image width="${width}" height="${height}" href="${dataUrl}"/></svg>`;
    }
    if (quality > 0.55) quality -= 0.1;
    else side = Math.round(side * 0.82);
  }
  bitmap.close();
  throw new Error("圖片太大，壓不進 Notion 的上限");
}

async function uploadImages(mcp: Mcp, files: Blob[], stamp: string) {
  const lines: string[] = [];
  for (let index = 0; index < files.length; index++) {
    const svg = await imageToSvg(files[index]);
    const result = await mcp.callTool(SERVER, "notion-create-attachment", {
      filename: `case-${stamp}-${index + 1}.svg`,
      content: svg,
    });
    const source = String((result.payload as { markdown_source?: string } | undefined)?.markdown_source ?? "");
    if (!source) throw new Error("Notion 沒有回傳圖片位置");
    lines.push(`<image src="${source}"></image>`);
  }
  return lines.join("\n");
}

// ---------- 牌組：和資料庫原本的寫法一致 ----------
// 三種牌型（2026/10/28）：
//   三張：「天相正｜化權倒｜衰倒」，多組用「；」接
//   三張＋身宮：「天相正｜化權倒｜衰倒；身宮：機陰正」
//   命遷＋長生：「命宮：紫貪正｜文昌正；遷移：武曲倒｜左輔正；長生：養倒」
// 其他寫法（含舊的特殊格式）用文字編輯，避免改壞
// 牌陣頁的小牌型也用這幾個型別和函式存牌組（2026/10/28），格式和案例選牌一致
export type Pick = { name: string; reversed: boolean };
export type Picks = Record<string, Pick | null>;
export type LayoutId = "three" | "body" | "mq";
export type SlotDef = { key: string; label: string; categoryIds: string[] };
export type CardSet = { layout: LayoutId; groups: Picks[] };

const MAIN_IDS = ["main", "pair"];
const THREE_SLOTS: SlotDef[] = SLOTS.map((slot) => ({ key: slot.key, label: slot.label, categoryIds: slot.categoryIds }));
const LAYOUTS: { id: LayoutId; name: string; slots: SlotDef[] }[] = [
  { id: "three", name: "三張", slots: THREE_SLOTS },
  { id: "body", name: "三張＋身宮", slots: [...THREE_SLOTS, { key: "body", label: "身宮", categoryIds: MAIN_IDS }] },
  {
    id: "mq",
    name: "命遷＋長生",
    slots: [
      { key: "lifeMain", label: "命主", categoryIds: MAIN_IDS },
      { key: "lifeMinor", label: "命輔", categoryIds: ["minor"] },
      { key: "travelMain", label: "遷主", categoryIds: MAIN_IDS },
      { key: "travelMinor", label: "遷輔", categoryIds: ["minor"] },
      { key: "stage", label: "長生", categoryIds: ["stage"] },
    ],
  },
];
export const layoutOf = (id: LayoutId) => LAYOUTS.find((item) => item.id === id)!;
export const emptyPicks = (id: LayoutId): Picks => Object.fromEntries(layoutOf(id).slots.map((slot) => [slot.key, null]));
export const pickText = (pick: Pick) => `${pick.name}${orientMark(pick)}`;

function parsePart(part: string): Pick | null {
  const bare = part.trim();
  // 空宮不分正倒，只寫「空宮」
  if (CARD_CATEGORY.has(bare) && !hasOrient(bare)) return { name: bare, reversed: false };
  const match = bare.match(/^(.+?)\s*[（(]?(正|倒|逆)[）)]?$/);
  if (!match || !CARD_CATEGORY.has(match[1])) return null;
  return fixOrient({ name: match[1], reversed: match[2] !== "正" });
}

// 組與組之間：「；」或換行（Notion 的 <br>、<br />）
const GROUP_SPLIT = /；|<br\s*\/?>/;

// 「身宮：機陰正」這種前面有標示的組
function splitLabel(group: string) {
  const match = group.match(/^\s*([^：:｜]{1,8})\s*[：:]\s*(.*)$/);
  return match ? { label: match[1], body: match[2] } : { label: "", body: group };
}

export function parseCardSet(text: string): CardSet | null {
  const trimmed = text.trim();
  if (!trimmed) return { layout: "three", groups: [emptyPicks("three")] };
  if (isSpreadText(trimmed)) return null;
  const groups = trimmed
    .split(GROUP_SPLIT)
    .map((group) => group.trim())
    .filter(Boolean)
    .map((group) => {
      const { label, body } = splitLabel(group);
      return { label, parts: body.split("｜").map(parsePart) };
    });
  if (groups.some((group) => group.parts.some((part) => !part))) return null;
  const g = groups as { label: string; parts: Pick[] }[];
  if (g.every((group) => !group.label && group.parts.length === 3)) {
    return { layout: "three", groups: g.map(({ parts }) => ({ main: parts[0], minor: parts[1], stage: parts[2] })) };
  }
  if (g.length === 2 && !g[0].label && g[0].parts.length === 3 && g[1].label === "身宮" && g[1].parts.length === 1) {
    const [main, minor, stage] = g[0].parts;
    return { layout: "body", groups: [{ main, minor, stage, body: g[1].parts[0] }] };
  }
  if (
    g.length === 3 &&
    /^命/.test(g[0].label) && g[0].parts.length === 2 &&
    /^遷/.test(g[1].label) && g[1].parts.length === 2 &&
    g[2].label === "長生" && g[2].parts.length === 1
  ) {
    return {
      layout: "mq",
      groups: [{ lifeMain: g[0].parts[0], lifeMinor: g[0].parts[1], travelMain: g[1].parts[0], travelMinor: g[1].parts[1], stage: g[2].parts[0] }],
    };
  }
  return null;
}

// 有空格就回傳空字串（還沒選齊）
export function cardSetToText({ layout, groups }: CardSet) {
  const slots = layoutOf(layout).slots;
  if (!groups.length || groups.some((group) => slots.some((slot) => !group[slot.key]))) return "";
  const t = (group: Picks, key: string) => pickText(group[key]!);
  if (layout === "body") {
    const group = groups[0];
    return `${t(group, "main")}｜${t(group, "minor")}｜${t(group, "stage")}；身宮：${t(group, "body")}`;
  }
  if (layout === "mq") {
    const group = groups[0];
    return `命宮：${t(group, "lifeMain")}｜${t(group, "lifeMinor")}；遷移：${t(group, "travelMain")}｜${t(group, "travelMinor")}；長生：${t(group, "stage")}`;
  }
  return groups.map((group) => `${t(group, "main")}｜${t(group, "minor")}｜${t(group, "stage")}`).join("；");
}

// 隨機取牌：每格依類別抽，正倒也隨機（空宮不分正倒）；同一筆案例不重複（某類抽完才重洗）
function drawCardSet(layout: LayoutId, count: number): CardSet {
  const piles = new Map<string, string[]>();
  const take = (ids: string[]) => {
    const id = ids.join(",");
    let pile = piles.get(id);
    if (!pile || !pile.length) {
      pile = CATEGORIES.filter((c) => ids.includes(c.id)).flatMap((c) => c.groups.flatMap((group) => group.cards));
      piles.set(id, pile);
    }
    return pile.splice(randomIndex(pile.length), 1)[0];
  };
  const slots = layoutOf(layout).slots;
  const groups = Array.from({ length: layout === "three" ? Math.max(count, 1) : 1 }, () =>
    Object.fromEntries(slots.map((slot) => [slot.key, fixOrient({ name: take(slot.categoryIds), reversed: randomIndex(2) === 1 })])),
  );
  return { layout, groups };
}

// 換牌型時，把目前選好的牌帶到新牌型（同位置的才帶）
const CARRY: Record<string, string> = { main: "lifeMain", minor: "lifeMinor", lifeMain: "main", lifeMinor: "minor", stage: "stage", body: "body" };
function carryOver(from: Picks, to: LayoutId): Picks {
  const next = emptyPicks(to);
  for (const key of Object.keys(next)) {
    const source = from[key] ?? from[Object.keys(CARRY).find((k) => CARRY[k] === key) ?? ""];
    if (source) next[key] = source;
  }
  return next;
}

// linked：在案例內容頁時，每張牌可以點開星曜資料庫的頁面
function CardChips({ text, linked = false }: { text: string; linked?: boolean }) {
  if (!text.trim()) return null;
  const groups = text.split(GROUP_SPLIT).filter((group) => group.trim());
  return (
    <span className="flex flex-col gap-1">
      {groups.map((raw, index) => {
        const { label, body } = splitLabel(raw);
        // 顯示時也接受「＋」分隔的舊寫法
        const picks = body.split(/｜|＋/).map(parsePart);
        if (picks.some((pick) => !pick)) {
          return (
            <span key={index} className="text-xs text-ink-soft">
              {raw.trim()}
            </span>
          );
        }
        return (
          <span key={index} className="flex flex-wrap items-center gap-1">
            {label && <span className="text-xs text-ink-soft">{label}</span>}
            {picks.map((pick, i) => {
              const owner = CARD_CATEGORY.get(pick!.name);
              const className = `rounded-full px-2 py-0.5 text-xs text-ink ${owner ? TONES[owner.tone].chip : "bg-paper"}`;
              const text = pickText(pick!);
              const href = linked ? starPageUrl(pick!.name) : null;
              return href ? (
                <a
                  key={i}
                  href={href}
                  target="_blank"
                  rel="noreferrer"
                  className={`${className} border border-transparent underline decoration-ink/30 underline-offset-2 ${FOCUS}`}
                >
                  {text}
                </a>
              ) : (
                <span key={i} className={className}>
                  {text}
                </span>
              );
            })}
          </span>
        );
      })}
    </span>
  );
}

// 選牌：上方是牌位（選了就顯示牌卡小圖，倒牌轉 180 度；點選中的牌位再點一次看大圖），下方選牌名
// locked：電腦隨機抽的牌，只能看、不能改（點牌看大圖）
// layouts：可選的牌型（日運只用三張、三張＋身宮）；multi：三張可不可以加組
export function CardsPicker({
  value,
  onChange,
  locked = false,
  lockNote = "",
  onDraw,
  layouts = ["three", "body", "mq"],
  multi = true,
}: {
  value: CardSet;
  onChange: (value: CardSet) => void;
  locked?: boolean;
  lockNote?: string;
  onDraw?: () => void;
  layouts?: LayoutId[];
  multi?: boolean;
}) {
  const firstEmpty = () => {
    for (let g = 0; g < value.groups.length; g++) {
      const slot = layoutOf(value.layout).slots.find((item) => !value.groups[g][item.key]);
      if (slot) return { group: g, key: slot.key };
    }
    return { group: 0, key: layoutOf(value.layout).slots[0].key };
  };
  const [active, setActive] = useState(firstEmpty);
  const [tabId, setTabId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Pick | null>(null);
  const [confirmDraw, setConfirmDraw] = useState(false);
  // 各牌型各自記著，切換不會弄丟
  const [stash, setStash] = useState<Partial<Record<LayoutId, Picks[]>>>({});
  const layout = layoutOf(value.layout);
  const groupIndex = Math.min(active.group, value.groups.length - 1);
  const slot = layout.slots.find((item) => item.key === active.key) ?? layout.slots[0];
  const slotCategories = CATEGORIES.filter((item) => slot.categoryIds.includes(item.id));
  const picked = value.groups[groupIndex]?.[slot.key]?.name;
  const category =
    slotCategories.find((item) => item.id === tabId) ??
    (picked ? slotCategories.find((item) => item.id === CARD_CATEGORY.get(picked)?.id) : undefined) ??
    slotCategories[0];
  const tone = TONES[category.tone];

  function choose(group: number, key: string) {
    setActive({ group, key });
    setTabId(null);
  }

  function setGroup(index: number, next: Picks) {
    onChange({ ...value, groups: value.groups.map((group, i) => (i === index ? next : group)) });
  }

  function pick(name: string) {
    const current = value.groups[groupIndex];
    const next = { ...current, [slot.key]: fixOrient({ name, reversed: current[slot.key]?.reversed ?? false }) };
    const groups = value.groups.map((group, i) => (i === groupIndex ? next : group));
    onChange({ ...value, groups });
    for (let g = groupIndex; g < groups.length; g++) {
      const empty = layout.slots.find((item) => !groups[g][item.key]);
      if (empty) return choose(g, empty.key);
    }
  }

  function switchLayout(id: LayoutId) {
    if (id === value.layout) return;
    setStash({ ...stash, [value.layout]: value.groups });
    const groups = stash[id] ?? [carryOver(value.groups[0], id)];
    onChange({ layout: id, groups });
    const empty = layoutOf(id).slots.find((item) => !groups[0][item.key]);
    choose(0, (empty ?? layoutOf(id).slots[0]).key);
  }

  function addGroup() {
    onChange({ ...value, groups: [...value.groups, emptyPicks("three")] });
    choose(value.groups.length, layout.slots[0].key);
  }

  function removeGroup(index: number) {
    onChange({ ...value, groups: value.groups.filter((_, i) => i !== index) });
    choose(0, layout.slots[0].key);
  }

  return (
    <div className="flex flex-col gap-3">
      {locked ? (
        <p className="text-xs text-ink-soft">{layout.name}・{lockNote}，不能修改（點牌看大圖）</p>
      ) : confirmDraw ? (
        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-paper px-3 py-2 text-sm">
          <span className="mr-auto">抽了之後就不能再改，確定嗎？</span>
          <button type="button" onClick={() => setConfirmDraw(false)} className={`rounded-full px-3 py-1 text-xs text-ink-soft ${FOCUS}`}>
            取消
          </button>
          <button
            type="button"
            onClick={() => {
              onChange(drawCardSet(value.layout, value.groups.length));
              setConfirmDraw(false);
              setTabId(null);
              onDraw?.();
            }}
            className={`rounded-full bg-ink px-3 py-1 text-xs text-paper-light ${FOCUS}`}
          >
            確定抽
          </button>
        </div>
      ) : (
      <div className="flex items-center gap-2">
        <div role="group" aria-label="牌型" className="flex flex-1 overflow-hidden rounded-full border border-line">
          {LAYOUTS.filter((item) => layouts.includes(item.id)).map((item) => (
            <button
              key={item.id}
              type="button"
              aria-pressed={item.id === value.layout}
              onClick={() => switchLayout(item.id)}
              className={`flex-1 px-1 py-1 text-xs whitespace-nowrap ${FOCUS} ${item.id === value.layout ? "bg-ink text-paper-light" : "text-ink-soft"}`}
            >
              {item.name}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setConfirmDraw(true)}
          className={`shrink-0 rounded-full border border-line px-3 py-1 text-xs text-ink ${FOCUS} hover:bg-paper`}
        >
          隨機抽
        </button>
      </div>
      )}

      {value.groups.map((group, g) => (
        <div key={g} className="flex flex-col gap-1">
          {value.groups.length > 1 && (
            <div className="flex items-center justify-between text-xs text-ink-soft">
              <span>第 {g + 1} 組</span>
              {!locked && <button type="button" onClick={() => removeGroup(g)} className={`underline underline-offset-4 hover:text-danger ${FOCUS}`}>
                刪除這組
              </button>}
            </div>
          )}
          <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${layout.slots.length}, minmax(0, 1fr))` }}>
            {layout.slots.map((item) => {
              const card = group[item.key];
              const selected = !locked && g === groupIndex && item.key === slot.key;
              const thumb = card ? cardThumb(card.name) : null;
              return (
                <div key={item.key} className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    aria-pressed={selected}
                    aria-label={`${item.label}：${card ? pickText(card) : "未選"}`}
                    onClick={() => (locked ? card && setZoom(card) : selected && card ? setZoom(card) : choose(g, item.key))}
                    className={`flex w-full flex-col items-center gap-0.5 rounded-lg border p-1 ${FOCUS} ${selected ? "border-ink bg-paper-light" : "border-line"}`}
                  >
                    <span className="text-[11px] leading-4 text-ink-soft">{item.label}</span>
                    {thumb ? (
                      <img src={thumb} alt={card!.name} className={`aspect-[440/800] w-full max-w-[56px] rounded-[3px] object-cover ${isReversed(card!) ? "rotate-180" : ""}`} />
                    ) : (
                      <span className="flex aspect-[440/800] w-full max-w-[56px] items-center justify-center rounded-[3px] bg-paper px-0.5 text-center text-[11px] leading-tight text-ink-soft">
                        {card ? card.name : "未選"}
                      </span>
                    )}
                  </button>
                  {locked ? (
                    <span className="text-xs text-ink-soft">{card ? orientMark(card) || "不分正倒" : ""}</span>
                  ) : card && !hasOrient(card.name) ? (
                    <span className="py-0.5 text-xs whitespace-nowrap text-ink-soft">不分正倒</span>
                  ) : (
                  <div role="group" aria-label={`${item.label}正倒位`} className="grid w-full grid-cols-2 overflow-hidden rounded-full border border-line">
                    {[false, true].map((reversed) => {
                      const on = (card?.reversed ?? false) === reversed;
                      return (
                        <button
                          key={String(reversed)}
                          type="button"
                          aria-pressed={on}
                          disabled={!card}
                          onClick={() => card && setGroup(g, { ...group, [item.key]: { ...card, reversed } })}
                          className={`py-0.5 text-xs disabled:opacity-40 ${on && card ? (reversed ? "bg-gold-deep text-paper-light" : "bg-ink text-paper-light") : "text-ink-soft"}`}
                        >
                          {reversed ? "倒" : "正"}
                        </button>
                      );
                    })}
                  </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
      {value.layout === "three" && multi && !locked && (
        <button type="button" onClick={addGroup} className={`w-fit text-xs text-ink-soft underline underline-offset-4 ${FOCUS}`}>
          ＋再加一組
        </button>
      )}

      {!locked && (
      <div className="rounded-xl bg-paper p-3">
        <p className="mb-2 text-xs text-ink-soft">
          {value.groups.length > 1 ? `第 ${groupIndex + 1} 組・` : ""}
          {slot.label}
        </p>
        {slotCategories.length > 1 && (
          <div role="tablist" aria-label={`${slot.label}分類`} className="mb-3 flex gap-4 border-b border-line">
            {slotCategories.map((item) => {
              const selected = item.id === category.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={selected}
                  onClick={() => setTabId(item.id)}
                  className={`-mb-px border-b-2 px-1 pb-2 text-sm tracking-[0.12em] ${FOCUS} ${
                    selected ? `${TONES[item.tone].border} ${TONES[item.tone].text} font-medium` : "border-transparent text-ink-soft"
                  }`}
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
                {group.cards.map((name) => (
                  <button
                    key={name}
                    type="button"
                    aria-pressed={name === picked}
                    onClick={() => pick(name)}
                    className={`rounded-full border px-3 py-1.5 text-sm tracking-[0.1em] ${FOCUS} ${
                      name === picked ? tone.active : `border-transparent ${tone.chip}`
                    }`}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      )}
      {zoom && <CardZoom card={zoom} onClose={() => setZoom(null)} />}
    </div>
  );
}

// ---------- 頁面內文：簡單排版（標題、清單、引言、粗體、收合、頁面連結） ----------
// 頁面連結：連到清單裡的案例就在手機頁內切換；其他頁面開 Notion
type Links = { title: (url: string) => string | null; open: (url: string) => void };

function inline(text: string, links?: Links): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /\*\*([^*]+)\*\*|<(b|strong)>([\s\S]*?)<\/\2>|<mention(?:-page)?\s[^>]*?url="([^"]+)"[^>]*?(?:\/>|>([\s\S]*?)<\/mention(?:-page)?>)/g;
  const plain = (part: string) => part.replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, "");
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(plain(text.slice(last, m.index)));
    const key = out.length;
    if (m[4]) {
      const url = m[4];
      const name = links?.title(url) ?? (plain(m[5] ?? "").trim() || "Notion 頁面");
      out.push(
        links?.title(url) ? (
          <button key={key} type="button" onClick={() => links.open(url)} className={`inline text-left underline underline-offset-4 ${FOCUS}`}>
            {name}
          </button>
        ) : (
          <a key={key} href={url} target="_blank" rel="noreferrer" className="underline underline-offset-4">
            {name} ↗
          </a>
        ),
      );
    } else {
      out.push(
        <strong key={key} className="font-medium">
          {plain(m[1] ?? m[3] ?? "")}
        </strong>,
      );
    }
    last = re.lastIndex;
  }
  if (last < text.length) out.push(plain(text.slice(last)));
  return out;
}

// 把「## 驗證回饋」那一段拆出來，放到內容頁最上面顯示
function splitFeedback(text: string) {
  const lines = text.split("\n");
  const feedback: string[] = [];
  const rest: string[] = [];
  let inFeedback = false;
  for (const line of lines) {
    if (/^##\s*驗證回饋\s*$/.test(line.trim())) {
      inFeedback = true;
      continue;
    }
    if (inFeedback && /^#{1,2}\s/.test(line)) inFeedback = false;
    (inFeedback ? feedback : rest).push(line);
  }
  return { feedback: feedback.join("\n").trim(), rest: rest.join("\n") };
}

// Notion 收合區塊：<toggle> 第一行是標題，其餘是內容；也接受 <details><summary>
const TOGGLE_OPEN = /^\s*<(toggle|details)\b[^>]*>\s*$/;
const TOGGLE_CLOSE = /^\s*<\/(toggle|details)>\s*$/;

function Markdown({ text, links }: { text: string; links?: Links }) {
  const blocks: ReactNode[] = [];
  let images = 0;
  const lines = text.split("\n");
  for (let index = 0; index < lines.length; index++) {
    if (TOGGLE_OPEN.test(lines[index])) {
      let depth = 1;
      let end = index + 1;
      for (; end < lines.length; end++) {
        if (TOGGLE_OPEN.test(lines[end])) depth++;
        else if (TOGGLE_CLOSE.test(lines[end]) && --depth === 0) break;
      }
      const inner = lines.slice(index + 1, end);
      const t = inner.findIndex((l) => l.trim());
      let title = t >= 0 ? inner[t].trim() : "";
      const summary = title.match(/^<summary>([\s\S]*?)<\/summary>$/);
      if (summary) title = summary[1];
      const rest = t >= 0 ? inner.slice(t + 1) : [];
      blocks.push(
        <details key={index} className="group mt-2 rounded-md border border-line bg-paper px-3 py-2">
          <summary className={`cursor-pointer list-none font-medium [&::-webkit-details-marker]:hidden tracking-[0.06em] ${FOCUS}`}>
            <span aria-hidden className="mr-1.5 inline-block text-xs text-ink-soft transition-transform group-open:rotate-90">
              ▸
            </span>
            {inline(title.replace(/^#{1,4}\s+/, ""), links)}
          </summary>
          <div className="mt-2">
            <Markdown text={rest.map((l) => l.replace(/^\t/, "")).join("\n")} links={links} />
          </div>
        </details>,
      );
      index = end;
      continue;
    }
    const raw = lines[index];
    const line = raw.trimEnd();
    if (!line.trim()) continue;
    if (/^!\[[^\]]*\]\(|^<image\s|^<file\s/.test(line.trim())) {
      images += 1;
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length;
      blocks.push(
        <p key={index} className={level <= 2 ? "mt-3 font-medium tracking-[0.08em]" : "mt-1 text-[15px] font-medium text-ink-soft"}>
          {inline(heading[2], links)}
        </p>,
      );
      continue;
    }
    const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
    if (bullet) {
      blocks.push(
        <p key={index} className="flex gap-1.5" style={{ marginLeft: `${Math.min(bullet[1].replace(/\t/g, "  ").length, 8) * 0.5}rem` }}>
          <span aria-hidden className="text-ink-soft">
            ・
          </span>
          <span className="whitespace-pre-wrap">{inline(bullet[2], links)}</span>
        </p>,
      );
      continue;
    }
    const quote = line.match(/^>\s?(.*)$/);
    if (quote) {
      blocks.push(
        <p key={index} className="border-l-2 border-line-strong pl-3 whitespace-pre-wrap text-ink-soft">
          {inline(quote[1], links)}
        </p>,
      );
      continue;
    }
    blocks.push(
      <p key={index} className="whitespace-pre-wrap">
        {inline(line, links)}
      </p>,
    );
  }
  return (
    <div className="flex flex-col gap-1.5 leading-7">
      {blocks.length ? blocks : <p className="text-ink-soft">（還沒有內容）</p>}
      {images > 0 && <p className="text-sm text-ink-soft">內文裡有 {images} 張圖片，到 Notion 打開看。</p>}
    </div>
  );
}

// ---------- 小元件 ----------
function Tag({ value, styles }: { value: string; styles: Record<string, string> }) {
  if (!value) return null;
  return <span className={`rounded-full px-2 py-0.5 text-xs ${styles[value] ?? "bg-paper"}`}>{value}</span>;
}

function Chips({ options, value, onToggle }: { options: readonly string[]; value: string[]; onToggle: (option: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => {
        const on = value.includes(option);
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(option)}
            className={`rounded-full px-3.5 py-1.5 text-sm transition-colors ${FOCUS} ${on ? "bg-ink text-paper-light" : "bg-paper hover:bg-line"}`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

function ImagePicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {files.map((file, index) => (
        <span key={index} className="flex items-center gap-1 rounded-full bg-paper px-3 py-1 text-xs">
          圖 {index + 1}
          <button
            type="button"
            aria-label={`移除圖 ${index + 1}`}
            onClick={() => onChange(files.filter((_, i) => i !== index))}
            className={`text-ink-soft hover:text-danger ${FOCUS}`}
          >
            ✕
          </button>
        </span>
      ))}
      <label className="cursor-pointer rounded-full border border-dashed border-line-strong px-4 py-1.5 text-sm hover:bg-paper has-focus-visible:outline-2 has-focus-visible:outline-ink">
        ＋ 加圖片
        <input
          type="file"
          accept="image/*"
          multiple
          className="sr-only"
          onChange={(event) => {
            const picked = Array.from(event.target.files ?? []);
            event.target.value = "";
            if (picked.length) onChange([...files, ...picked]);
          }}
        />
      </label>
    </div>
  );
}

const LABEL = "text-sm tracking-widest text-ink-soft";

// ---------- 新增／編輯表單 ----------
function CaseForm({
  initial,
  defaultPersonId,
  people,
  options,
  busy,
  cardsLocked = false,
  onSave,
  onCancel,
}: {
  initial?: Case;
  defaultPersonId?: string | null;
  people: PersonRef[];
  options: Options;
  busy: boolean;
  // 編輯時：已經存過牌組的案例，牌組鎖住不能改
  cardsLocked?: boolean;
  onSave: (data: CaseInput) => void;
  onCancel: () => void;
}) {
  const simple = parseCardSet(initial?.cards ?? "");
  const [title, setTitle] = useState(initial?.title ?? "");
  const [date, setDate] = useState(initial?.date || today());
  const [personId, setPersonId] = useState<string>(initial ? initial.personId ?? "" : defaultPersonId ?? "");
  const [who, setWho] = useState(initial?.who ?? "");
  const [type, setType] = useState(initial?.type ?? "");
  const [keywords, setKeywords] = useState<string[]>(initial?.keywords ?? []);
  const [status, setStatus] = useState(initial?.status || "待驗證");
  const [verify, setVerify] = useState(initial?.verify || "未知");
  const [track, setTrack] = useState(initial?.track ?? false);
  const [trackUntil, setTrackUntil] = useState(initial?.trackUntil ?? "");
  const [analysis, setAnalysis] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  // 牌組：一般用選牌介面；原本是多組或特殊寫法的，改用文字編輯，避免改壞
  const [withCards, setWithCards] = useState(Boolean(initial?.cards));
  const [textMode, setTextMode] = useState(simple === null);
  const [cardSet, setCardSet] = useState<CardSet>(simple ?? { layout: "three", groups: [emptyPicks("three")] });
  const [cardsText, setCardsText] = useState(initial?.cards ?? "");
  const [textNote, setTextNote] = useState(false);
  const [drawn, setDrawn] = useState(false);
  const locked = drawn || cardsLocked;
  const cardsValue = !withCards ? "" : textMode ? cardsText.trim() : cardSetToText(cardSet);
  const cardsReady = !withCards || Boolean(cardsValue);

  const groups = [...new Set(people.map((person) => person.group))];
  const ready = title.trim() && date && cardsReady;

  return (
    <form
      className="flex flex-col gap-4 border border-line bg-paper-light p-4 sm:p-6"
      onSubmit={(event) => {
        event.preventDefault();
        if (!ready || busy) return;
        onSave({
          title: title.trim(),
          date,
          personId: personId || null,
          who: who.trim(),
          type,
          keywords,
          status,
          verify,
          track,
          trackUntil,
          cards: cardsValue,
          drawn,
          analysis,
          files,
        });
      }}
    >
      <h2 className="text-lg font-medium tracking-[0.12em]">{initial ? "編輯案例" : "新增案例"}</h2>
      <label className="flex flex-col gap-1">
        <span className={LABEL}>案例名稱（問題）</span>
        <input value={title} onChange={(event) => setTitle(event.target.value)} className={INPUT} placeholder="例如：工作｜面試後核薪是否符合期望" />
      </label>
      <label className="flex flex-col gap-1">
        <span className={LABEL}>日期</span>
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} className={INPUT} />
      </label>
      <div className="flex flex-col gap-1">
        <label htmlFor="case-person" className={LABEL}>
          對象
        </label>
        <select id="case-person" value={personId} onChange={(event) => setPersonId(event.target.value)} className={INPUT}>
          <option value="">沒有命盤</option>
          {groups.map((group) => (
            <optgroup key={group} label={group}>
              {people
                .filter((person) => person.group === group)
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name || "未命名"}
                  </option>
                ))}
            </optgroup>
          ))}
        </select>
        <input
          value={who}
          onChange={(event) => setWho(event.target.value)}
          className={INPUT}
          placeholder={personId ? "補充說明（可不填）" : "名字或描述（可不填），例如：朋友的姊姊"}
        />
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className={LABEL}>牌組</span>
          <div className="flex items-center gap-3">
            {withCards && !locked && (
              <button
                type="button"
                onClick={() => {
                  if (textMode) {
                    // 文字不是選牌格式就留在文字，免得改壞
                    const parsed = parseCardSet(cardsText);
                    if (!parsed) return setTextNote(true);
                    setCardSet(parsed);
                  } else {
                    setCardsText(cardSetToText(cardSet) || cardsText);
                  }
                  setTextNote(false);
                  setTextMode(!textMode);
                }}
                className={`text-xs text-ink-soft underline underline-offset-4 ${FOCUS}`}
              >
                {textMode ? "改用選牌" : "改用文字"}
              </button>
            )}
            <button
              type="button"
              aria-pressed={withCards}
              disabled={locked}
              onClick={() => setWithCards(!withCards)}
              className={`rounded-full px-3.5 py-1.5 text-sm ${FOCUS} ${withCards ? "bg-ink text-paper-light" : "bg-paper hover:bg-line"}`}
            >
              {withCards ? "解牌 ✓" : "＋ 這是解牌"}
            </button>
          </div>
        </div>
        {withCards &&
          (textMode && cardsLocked ? (
            <p className="rounded-xl bg-paper px-3 py-2 text-sm break-words text-ink-soft">
              {cardsText}
              <span className="mt-1 block text-xs">存檔後的牌組，不能修改。</span>
            </p>
          ) : textMode ? (
            <>
            <textarea
              rows={3}
              value={cardsText}
              onChange={(event) => setCardsText(event.target.value)}
              className={`${INPUT} resize-y leading-7`}
              placeholder="例如：紫微正｜化祿倒｜墓正；紫殺倒｜文昌倒｜長生倒"
            />
            {textNote && <p className="text-xs text-ink-soft">這段文字不是選牌的格式，請用文字編輯。</p>}
            </>
          ) : (
            <CardsPicker
              value={cardSet}
              onChange={setCardSet}
              locked={locked}
              lockNote={cardsLocked ? "存檔後的牌組" : "電腦隨機抽的牌"}
              onDraw={() => setDrawn(true)}
            />
          ))}
      </div>

      <div className="flex flex-col gap-1.5">
        <span className={LABEL}>類型</span>
        <Chips options={options.類型} value={[type]} onToggle={(option) => setType(type === option ? "" : option)} />
      </div>
      {options.關鍵字.length > 0 && (
        <details open={keywords.length > 0}>
          <summary className={`${LABEL} cursor-pointer`}>關鍵字{keywords.length ? `（${keywords.length}）` : ""}</summary>
          <div className="mt-2">
            <Chips
              options={options.關鍵字}
              value={keywords}
              onToggle={(option) =>
                setKeywords(keywords.includes(option) ? keywords.filter((item) => item !== option) : [...keywords, option])
              }
            />
          </div>
        </details>
      )}
      <div className="flex flex-col gap-1.5">
        <span className={LABEL}>狀態</span>
        <Chips options={options.狀態} value={[status]} onToggle={setStatus} />
      </div>
      <div className="flex flex-col gap-1.5">
        <span className={LABEL}>驗證</span>
        <Chips options={options.驗證} value={[verify]} onToggle={setVerify} />
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={track} onChange={(event) => setTrack(event.target.checked)} className="h-4 w-4 accent-ink" />
          可追蹤
        </label>
        {(track || trackUntil) && (
          <label className="flex items-center gap-2 text-sm text-ink-soft">
            期限
            <input type="date" value={trackUntil} onChange={(event) => setTrackUntil(event.target.value)} className={`${INPUT} py-1.5`} />
          </label>
        )}
      </div>
      {!initial && (
        <>
          <label className="flex flex-col gap-1">
            <span className={LABEL}>解析</span>
            <textarea
              rows={7}
              value={analysis}
              onChange={(event) => setAnalysis(event.target.value)}
              className={`${INPUT} resize-y leading-7`}
              placeholder="怎麼看這組牌、怎麼判斷…"
            />
          </label>
          <div className="flex flex-col gap-1.5">
            <span className={LABEL}>圖片</span>
            <ImagePicker files={files} onChange={setFiles} />
          </div>
        </>
      )}
      {initial && <p className="text-xs text-ink-soft">這裡改的是欄位；內文（解析等）請到 Notion 修改。</p>}
      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
        {!ready && <span className="mr-auto text-sm text-ink-soft">{cardsReady ? "填好名稱和日期就能儲存。" : "牌組還沒選齊。"}</span>}
        <button type="button" onClick={onCancel} className={BUTTON_GHOST}>
          取消
        </button>
        <button type="submit" disabled={!ready || busy} className={BUTTON_PRIMARY}>
          {busy ? "儲存中…" : "儲存"}
        </button>
      </div>
    </form>
  );
}

// ---------- 主畫面 ----------
export function CasesView({
  mcp,
  people,
  focusPerson,
  onClearFocus,
  onOpenChart,
  onOpenGua,
  onOpenSpread,
  onCasesLoaded,
  initialOpenId = null,
}: {
  mcp: Mcp;
  people: PersonRef[];
  focusPerson: string | null;
  onClearFocus: () => void;
  onOpenChart: (personId: string) => void;
  onOpenGua: (item: Case) => void;
  onOpenSpread: (item: Case) => void;
  onCasesLoaded: (cases: Case[]) => void;
  initialOpenId?: string | null;
}) {
  const [cases, setCases] = useState<Case[] | null>(null);
  const [options, setOptions] = useState<Options>(FALLBACK);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("全部");
  const [openId, setOpenId] = useState<string | null>(initialOpenId);
  const [mode, setMode] = useState<"list" | "new" | "edit">("list");
  const [body, setBody] = useState<string | null>(null);
  const [bodyError, setBodyError] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState("");
  const [moreFiles, setMoreFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  const personName = (id: string | null) => people.find((person) => normId(person.id) === id)?.name ?? "";

  const load = useCallback(async () => {
    setError("");
    try {
      let rows: Record<string, unknown>[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 10; page++) {
        const data: Record<string, unknown> = { mode: "view", view_url: VIEW, page_size: 100 };
        if (cursor) data.start_cursor = cursor;
        const result = await mcp.callTool(SERVER, "notion-query-data-sources", { data }, { cache: false });
        const payload = (result.payload ?? {}) as { results?: Record<string, unknown>[]; has_more?: boolean; next_cursor?: string };
        rows = rows.concat(payload.results ?? []);
        if (!payload.has_more || !payload.next_cursor) break;
        cursor = payload.next_cursor;
      }
      const list = rows.map(toCase).sort((a, b) => b.date.localeCompare(a.date));
      setCases(list);
      onCasesLoaded(list);
    } catch (e) {
      setError(explain(e as McpError));
      setCases((current) => current ?? []);
    }
  }, [mcp, onCasesLoaded]);

  const loadOptions = useCallback(async () => {
    try {
      const result = await mcp.callTool(SERVER, "notion-fetch", { id: `collection://${DATA_SOURCE}` }, { cache: false });
      const next = readOptions(result.payload);
      if (next) setOptions(next);
    } catch {
      // 讀不到就用備用選項
    }
  }, [mcp]);

  useEffect(() => {
    load();
    loadOptions();
  }, [load, loadOptions]);

  const open = cases?.find((item) => item.id === openId) ?? null;
  // 內文裡的頁面連結：連到清單裡的案例就直接切過去
  const links: Links = {
    title: (url) => cases?.find((item) => item.id === normId(url))?.title ?? null,
    open: (url) => {
      setOpenId(normId(url));
      window.scrollTo(0, 0);
    },
  };

  const loadBody = useCallback(
    async (item: Case) => {
      setBody(null);
      setBodyError("");
      try {
        const result = await mcp.callTool(SERVER, "notion-fetch", { id: item.url }, { cache: false });
        setBody(pageContent(result.payload));
      } catch (e) {
        setBodyError(explain(e as McpError));
      }
    },
    [mcp],
  );

  useEffect(() => {
    if (open) loadBody(open);
    // 只在換到另一筆時重讀
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.id, loadBody]);

  function flash(text: string) {
    setNotice(text);
    window.setTimeout(() => setNotice(""), 4000);
  }

  // 編輯時沒改到的日期不送出，避免把原本的日期區間（例如 10/1～10/31）蓋成單一天
  function properties(data: CaseInput, before?: Case) {
    const props: Record<string, unknown> = {
      案例名稱: data.title,
      "date:日期:start": data.date,
      "date:日期:is_datetime": 0,
      命盤: data.personId ? [data.personId] : [],
      對象: data.who,
      類型: data.type || null,
      關鍵字: data.keywords,
      狀態: data.status,
      驗證: data.verify,
      可追蹤: data.track ? "__YES__" : "__NO__",
      牌組: data.cards,
    };
    if (!before || data.trackUntil !== before.trackUntil) props["date:可追蹤期限:start"] = data.trackUntil || null;
    // 一筆案例可能連了多個命盤，畫面只帶第一個；沒改命盤就不送，免得把其他關聯清掉
    if (before && data.personId === before.personId) delete props["命盤"];
    if (before && data.date === before.date) {
      delete props["date:日期:start"];
      delete props["date:日期:is_datetime"];
    }
    // 編輯時只寫有變動的欄位
    if (before) {
      const same: [string, boolean][] = [
        ["案例名稱", data.title === before.title],
        ["對象", data.who === before.who],
        ["類型", data.type === before.type],
        ["關鍵字", data.keywords.join("\u0000") === before.keywords.join("\u0000")],
        ["狀態", data.status === before.status],
        ["驗證", data.verify === before.verify],
        ["可追蹤", data.track === before.track],
        ["牌組", data.cards === before.cards],
      ];
      for (const [key, unchanged] of same) if (unchanged) delete props[key];
    }
    return props;
  }

  async function saveNew(data: CaseInput) {
    setBusy(true);
    setError("");
    try {
      const images = data.files.length ? await uploadImages(mcp, data.files, stampNow()) : "";
      const content = [
        `## 提問\n${data.title}`,
        data.cards ? `## 牌組\n**${data.cards}**${data.drawn ? `\n${DRAWN_MARK}` : ""}` : "",
        data.analysis.trim() ? `## 解析\n${data.analysis.trim()}` : "",
        images ? `## 圖片\n${images}` : "",
      ]
        .filter(Boolean)
        .join("\n");
      const result = await mcp.callTool(SERVER, "notion-create-pages", {
        parent: { data_source_id: DATA_SOURCE },
        pages: [{ properties: properties(data), content }],
        allow_async: false,
      });
      const created = (result.payload as { pages?: { url?: string; id?: string }[] } | undefined)?.pages?.[0];
      await load();
      setMode("list");
      if (created) setOpenId(normId(created.url || created.id || ""));
      flash("已存進 ZW 案例資料庫。");
    } catch (e) {
      await load();
      setError(explain(e as McpError) + "　如果清單裡已經出現這一筆，就是有存進去了。");
    }
    setBusy(false);
  }

  async function saveEdit(data: CaseInput) {
    if (!open) return;
    setBusy(true);
    setError("");
    const props = properties(data, open);
    if (!Object.keys(props).length) {
      setBusy(false);
      setMode("list");
      flash("沒有變更。");
      return;
    }
    try {
      await mcp.callTool(SERVER, "notion-update-page", {
        page_id: open.id,
        command: "update_properties",
        properties: props,
        allow_async: false,
      });
      await load();
      setMode("list");
      flash("已更新。");
    } catch (e) {
      setError(explain(e as McpError));
    }
    setBusy(false);
  }

  async function setField(item: Case, field: "狀態" | "驗證", value: string) {
    setBusy(true);
    try {
      await mcp.callTool(SERVER, "notion-update-page", {
        page_id: item.id,
        command: "update_properties",
        properties: { [field]: value },
        allow_async: false,
      });
      setCases(
        (list) =>
          list?.map((other) =>
            other.id === item.id ? { ...other, ...(field === "狀態" ? { status: value } : { verify: value }) } : other,
          ) ?? list,
      );
    } catch (e) {
      setError(explain(e as McpError));
    }
    setBusy(false);
  }

  // 回饋記在「## 驗證回饋」底下（新的在上面）；原本的內文不動
  async function addFeedback(item: Case) {
    const text = feedback.trim().replace(/\n+/g, "　");
    if (!text || body === null) return;
    const [, month, day] = today().split("-").map(Number);
    const line = `- ${month}/${day}｜${text}`;
    setBusy(true);
    try {
      if (/^## 驗證回饋\s*$/m.test(body)) {
        await mcp.callTool(SERVER, "notion-update-page", {
          page_id: item.id,
          command: "update_content",
          content_updates: [{ old_str: "## 驗證回饋", new_str: `## 驗證回饋\n${line}` }],
          allow_async: false,
        });
      } else {
        await mcp.callTool(SERVER, "notion-update-page", {
          page_id: item.id,
          command: "insert_content",
          content: `## 驗證回饋\n${line}`,
          position: { type: "end" },
          allow_async: false,
        });
      }
      setFeedback("");
      await loadBody(item);
      flash("回饋已記下。");
    } catch (e) {
      setError(explain(e as McpError));
    }
    setBusy(false);
  }

  async function addImages(item: Case) {
    if (!moreFiles.length) return;
    setBusy(true);
    try {
      const images = await uploadImages(mcp, moreFiles, stampNow());
      await mcp.callTool(SERVER, "notion-update-page", {
        page_id: item.id,
        command: "insert_content",
        content: images,
        position: { type: "end" },
        allow_async: false,
      });
      setMoreFiles([]);
      await loadBody(item);
      flash("圖片已存進 Notion（放在內文最後）。");
    } catch (e) {
      setError(explain(e as McpError) || String((e as Error).message));
    }
    setBusy(false);
  }

  async function remove(item: Case) {
    setBusy(true);
    setError("");
    try {
      await mcp.callTool(SERVER, "notion-delete-pages", { page_ids: [item.id], user_confirmed: true });
      setCases((list) => list?.filter((other) => other.id !== item.id) ?? list);
      setOpenId(null);
      setConfirmDelete(false);
      flash(`已刪除「${item.title}」，要救回可以到 Notion 的垃圾桶。`);
      load();
    } catch (e) {
      setError(explain(e as McpError));
    }
    setBusy(false);
  }

  // ---------- 畫面 ----------
  const keyword = query.trim();
  const filtered = (cases ?? []).filter((item) => {
    if (focusPerson && item.personId !== focusPerson) return false;
    if (options.狀態.includes(filter) && item.status !== filter) return false;
    if (filter === "解牌" && (!item.cards || isSpreadText(item.cards))) return false;
    if (filter === "牌陣" && !isSpreadText(item.cards)) return false;
    if (filter === "取卦" && !item.gua) return false;
    if (options.類型.includes(filter) && item.type !== filter) return false;
    if (!keyword) return true;
    return [item.title, item.who, personName(item.personId), item.cards, item.gua, item.date, item.type, ...item.keywords].some((value) =>
      value.includes(keyword),
    );
  });
  const count = (status: string) => (cases ?? []).filter((item) => item.status === status).length;
  const usedTypes = options.類型.filter((type) => cases?.some((item) => item.type === type));
  const filters = ["全部", "待驗證", "討論中", "解牌", ...(cases?.some((item) => item.gua) ? ["取卦"] : []), ...(cases?.some((item) => isSpreadText(item.cards)) ? ["牌陣"] : []), ...usedTypes];

  const banner = (
    <>
      {error && (
        <p role="alert" className="rounded-lg bg-apricot-soft px-4 py-3 text-sm text-apricot-deep">
          {error}
        </p>
      )}
      {notice && (
        <p role="status" className="rounded-lg bg-paper-light px-4 py-2 text-sm">
          {notice}
        </p>
      )}
    </>
  );

  if (mode === "new" || (mode === "edit" && open)) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-2 py-3 sm:px-6">
        {banner}
        <CaseForm
          key={mode === "edit" ? open?.id : "new"}
          initial={mode === "edit" ? open ?? undefined : undefined}
          defaultPersonId={focusPerson}
          people={people.map((person) => ({ ...person, id: normId(person.id) }))}
          options={options}
          busy={busy}
          cardsLocked={mode === "edit" && Boolean(open?.cards)}
          onSave={mode === "edit" ? saveEdit : saveNew}
          onCancel={() => setMode("list")}
        />
        {busy && mode === "new" && <p className="text-sm text-ink-soft">正在存進 Notion（有圖片會比較久）…</p>}
      </div>
    );
  }

  if (open) {
    const name = personName(open.personId);
    const split = body === null ? null : splitFeedback(body);
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-2 py-3 sm:px-6">
        <button type="button" onClick={() => setOpenId(null)} className={`w-fit text-sm text-ink-soft underline underline-offset-4 ${FOCUS}`}>
          ← 案例清單
        </button>
        {banner}
        <article className="flex flex-col gap-4 border border-line bg-paper-light p-4 sm:p-6">
          <div className="flex flex-col gap-1.5">
            <span className="flex items-center gap-2 text-xs tracking-widest text-ink-soft">
              {shortDate(open.date)}
              {open.type && <span className="rounded-full bg-paper px-2 py-0.5 tracking-normal">{open.type}</span>}
            </span>
            <h2 className="text-lg leading-7 font-medium">{open.title}</h2>
            {(name || open.who) && (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                {name && (
                  <button type="button" onClick={() => onOpenChart(open.personId!)} className={`rounded-full bg-ink px-3 py-1 text-paper-light ${FOCUS}`}>
                    {name}・看命盤 →
                  </button>
                )}
                {open.who && <span className="text-ink-soft">{open.who}</span>}
              </div>
            )}
            {isSpreadText(open.cards) ? (
              parseSpreadText(open.cards) ? (
                <button type="button" onClick={() => onOpenSpread(open)} className={`w-fit rounded-full bg-gold-soft px-3 py-1 text-sm text-gold-deep ${FOCUS}`}>
                  {open.cards.split("；")[0].split("｜").slice(1).join("｜")}・看牌陣 →
                </button>
              ) : (
                <p className="text-xs text-ink-soft">牌陣：待確認（牌組文字格式不完整）</p>
              )
            ) : (
              <CardChips text={open.cards} linked />
            )}
            {open.gua && (
              <button
                type="button"
                onClick={() => onOpenGua(open)}
                className={`w-fit rounded-full bg-[#f6e1e6] px-3 py-1 text-sm text-wine ${FOCUS}`}
              >
                卦 {open.gua.split(/[｜|]/).slice(0, 2).join("｜")}・看卦盤 →
              </button>
            )}
            {/* 舊案例沒有存十二宮：只標示，不自動補寫 */}
            {open.gua && body !== null && !body.includes("卦盤十二宮") && <p className="text-xs text-ink-soft">卦盤十二宮：待補（建立時尚未存盤面）</p>}
            {open.keywords.length > 0 && <p className="text-xs text-ink-soft">{open.keywords.map((word) => `#${word}`).join(" ")}</p>}
            {open.track && <p className="text-xs text-ink-soft">可追蹤{open.trackUntil ? `，期限 ${shortDate(open.trackUntil)}` : ""}</p>}
          </div>

          <section className="flex flex-col gap-2 rounded-xl bg-paper p-3">
            <h3 className={LABEL}>驗證回饋</h3>
            {body === null && !bodyError && <p className="text-sm text-ink-soft">讀取中…</p>}
            {split && (split.feedback ? <Markdown key={open.id} text={split.feedback} links={links} /> : <p className="text-sm text-ink-soft">還沒有回饋。</p>)}
            <div className="flex gap-2">
              <input
                value={feedback}
                onChange={(event) => setFeedback(event.target.value)}
                placeholder="後來實際怎麼了…"
                className={`${INPUT} min-w-0 flex-1`}
              />
              <button type="button" disabled={!feedback.trim() || busy || body === null} onClick={() => addFeedback(open)} className={`rounded-full border border-line bg-paper-light px-5 text-sm tracking-[0.12em] disabled:opacity-40 ${FOCUS}`}>
                記下
              </button>
            </div>
          </section>

          <div className="flex flex-col gap-1.5">
            <span className={LABEL}>狀態</span>
            <Chips options={options.狀態} value={[open.status]} onToggle={(value) => !busy && setField(open, "狀態", value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <span className={LABEL}>驗證</span>
            <Chips options={options.驗證} value={[open.verify]} onToggle={(value) => !busy && setField(open, "驗證", value)} />
          </div>

          <section className="flex flex-col gap-2 border-t border-line pt-3">
            <div className="flex items-center justify-between">
              <h3 className={LABEL}>內文</h3>
              <a href={open.url} target="_blank" rel="noreferrer" className="text-sm underline underline-offset-4">
                在 Notion 打開 ↗
              </a>
            </div>
            {bodyError && <p className="text-sm text-danger">{bodyError}</p>}
            {body === null && !bodyError && <p className="text-sm text-ink-soft">讀取內容…</p>}
            {split && <Markdown key={open.id} text={split.rest} links={links} />}
          </section>

          <section className="flex flex-col gap-2">
            <h3 className={LABEL}>加圖片</h3>
            <ImagePicker files={moreFiles} onChange={setMoreFiles} />
            {moreFiles.length > 0 && (
              <button type="button" disabled={busy} onClick={() => addImages(open)} className={`${BUTTON_GHOST} w-fit`}>
                {busy ? "上傳中…" : `存 ${moreFiles.length} 張到 Notion`}
              </button>
            )}
          </section>

          {confirmDelete ? (
            <div className="flex flex-col gap-2 rounded-xl bg-apricot-soft p-3 text-sm text-apricot-deep">
              <p>確定刪除這個案例？會移到 Notion 的垃圾桶，之後還能從那裡救回。</p>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => setConfirmDelete(false)} className={BUTTON_GHOST}>
                  取消
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => remove(open)}
                  className={`rounded-full bg-danger px-6 py-2.5 text-sm text-paper-light disabled:opacity-40 ${FOCUS}`}
                >
                  {busy ? "刪除中…" : "刪除"}
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between border-t border-line pt-3">
              <button
                type="button"
                disabled={busy}
                onClick={() => setConfirmDelete(true)}
                className={`text-sm text-ink-soft underline underline-offset-4 hover:text-danger ${FOCUS}`}
              >
                刪除案例
              </button>
              <button type="button" disabled={busy} onClick={() => setMode("edit")} className={BUTTON_GHOST}>
                編輯欄位
              </button>
            </div>
          )}
        </article>
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-3 px-2 py-3 sm:px-6">
      <div className="flex items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="搜尋名稱、對象、牌組、關鍵字…"
          className={`${INPUT} min-w-0 flex-1`}
        />
        <button type="button" onClick={() => setMode("new")} className={`${BUTTON_PRIMARY} shrink-0 px-5`}>
          ＋ 新增
        </button>
      </div>
      {focusPerson && (
        <p className="flex items-center gap-2 text-sm">
          只看「{personName(focusPerson) || "這個人"}」的案例
          <button type="button" onClick={onClearFocus} className={`text-ink-soft underline underline-offset-4 ${FOCUS}`}>
            看全部
          </button>
        </p>
      )}
      <div className="-mx-2 flex gap-2 overflow-x-auto px-2 pb-1">
        {filters.map((name) => (
          <button
            key={name}
            type="button"
            aria-pressed={filter === name}
            onClick={() => setFilter(name)}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm whitespace-nowrap ${FOCUS} ${
              filter === name ? "bg-ink text-paper-light" : "bg-paper-light hover:bg-line"
            }`}
          >
            {name}
            {options.狀態.includes(name) && count(name) ? ` ${count(name)}` : ""}
          </button>
        ))}
      </div>
      {banner}
      {cases === null && !error && <p className="text-sm text-ink-soft">正在讀取 ZW 案例資料庫…</p>}
      {cases && filtered.length === 0 && (
        <p className="border border-line bg-paper-light px-4 py-10 text-center text-sm text-ink-soft">
          {cases.length ? "找不到符合的案例。" : "還沒有案例，按「＋ 新增」記下第一個。"}
        </p>
      )}
      <ul className="flex flex-col gap-2">
        {filtered.map((item) => {
          const name = personName(item.personId);
          return (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => {
                  setFeedback("");
                  setMoreFiles([]);
                  setConfirmDelete(false);
                  setOpenId(item.id);
                }}
                className={`flex w-full flex-col gap-1 border border-line bg-paper-light px-4 py-3 text-left hover:border-line-strong ${FOCUS}`}
              >
                <span className="flex flex-wrap items-center gap-1.5 text-xs text-ink-soft">
                  {shortDate(item.date)}
                  <Tag value={item.status} styles={STATUS_STYLE} />
                  {item.verify && item.verify !== "未知" && <Tag value={item.verify} styles={VERIFY_STYLE} />}
                  {item.type && <span>#{item.type}</span>}
                </span>
                <span className="leading-6 font-medium">{item.title}</span>
                {(name || item.who) && (
                  <span className="flex flex-wrap items-center gap-2 text-xs text-ink-soft">
                    {name && <span className="rounded-full bg-ink/10 px-2 py-0.5 text-ink">{name}</span>}
                    {item.who && <span>{item.who}</span>}
                  </span>
                )}
                {isSpreadText(item.cards) ? (
                  <span className="w-fit rounded-full bg-gold-soft px-2 py-0.5 text-xs text-gold-deep">{item.cards.split("；")[0]}</span>
                ) : (
                  <CardChips text={item.cards} />
                )}
                {item.gua && <span className="w-fit rounded-full bg-[#f6e1e6] px-2 py-0.5 text-xs text-wine">卦 {item.gua}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
