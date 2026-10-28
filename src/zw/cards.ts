export type Tone = "taupe" | "mist" | "gold" | "apricot";

export type CardGroup = {
  name: string;
  cards: string[];
};

export type Category = {
  id: string;
  name: string;
  hint: string;
  tone: Tone;
  groups: CardGroup[];
};

export const CATEGORIES: Category[] = [
  {
    id: "main",
    name: "十四主星",
    hint: "紫微、天府兩大星系，另含空宮牌",
    tone: "taupe",
    groups: [
      {
        name: "紫微星系",
        cards: ["紫微", "天機", "太陽", "武曲", "天同", "廉貞"],
      },
      {
        name: "天府星系",
        cards: ["天府", "太陰", "貪狼", "巨門", "天相", "天梁", "七殺", "破軍"],
      },
      {
        name: "空宮",
        cards: ["空宮"],
      },
    ],
  },
  {
    id: "pair",
    name: "雙星組合",
    hint: "同宮的二十四種主星組合",
    tone: "mist",
    groups: [
      {
        name: "紫微系",
        cards: ["紫府", "紫貪", "紫相", "紫殺", "紫破"],
      },
      {
        name: "天機系",
        cards: ["機陰", "機巨", "機梁"],
      },
      {
        name: "太陽系",
        cards: ["日月", "巨日", "陽梁"],
      },
      {
        name: "武曲系",
        cards: ["武府", "武貪", "武相", "武殺", "武破"],
      },
      {
        name: "天同系",
        cards: ["陰同", "同巨", "同梁"],
      },
      {
        name: "廉貞系",
        cards: ["廉府", "廉貪", "廉相", "廉殺", "廉破"],
      },
    ],
  },
  {
    id: "minor",
    name: "輔星",
    hint: "六吉、煞星、四化與其他輔星",
    tone: "gold",
    groups: [
      {
        name: "六吉星",
        cards: ["左輔", "右弼", "文昌", "文曲", "天魁", "天鉞"],
      },
      {
        name: "煞星",
        cards: ["擎羊", "陀羅", "火星", "鈴星"],
      },
      {
        name: "四化",
        cards: ["化祿", "化權", "化科", "化忌"],
      },
      {
        name: "其他",
        cards: ["祿存", "鸞喜", "天刑", "陰煞", "空劫"],
      },
    ],
  },
  {
    id: "stage",
    name: "十二長生",
    hint: "由長生至養的十二階段",
    tone: "apricot",
    groups: [
      {
        name: "十二長生",
        cards: [
          "長生",
          "沐浴",
          "冠帶",
          "臨官",
          "帝旺",
          "衰",
          "病",
          "死",
          "墓",
          "絕",
          "胎",
          "養",
        ],
      },
    ],
  },
];

// 每日三牌的三個位置；主星位可放單一主星或雙星組合
export type SlotKey = "main" | "minor" | "stage";

export const SLOTS: { key: SlotKey; label: string; categoryIds: string[] }[] = [
  { key: "main", label: "主星", categoryIds: ["main", "pair"] },
  { key: "minor", label: "輔星", categoryIds: ["minor"] },
  { key: "stage", label: "長生", categoryIds: ["stage"] },
];

// 空宮牌只有外框、上下對稱，沒有正倒（2026/10/28）：抽牌不給倒、手選沒有正倒鈕、文字只寫「空宮」。
// 舊資料寫成「空宮倒」「空宮正」也照讀，但一律當成不分正倒（不轉 180 度、不標正倒）。
export const hasOrient = (name: string) => name !== "空宮";
// 畫面上要不要轉 180 度、用倒牌顏色
export const isReversed = (card: { name: string; reversed: boolean }) => card.reversed && hasOrient(card.name);
// 牌名後面接的「正／倒」；空宮是空字串
export const orientMark = (card: { name: string; reversed: boolean }) => (hasOrient(card.name) ? (card.reversed ? "倒" : "正") : "");
// 存進資料前把空宮的方向歸零
export const fixOrient = <T extends { name: string; reversed: boolean }>(card: T): T => (isReversed(card) || !card.reversed ? card : { ...card, reversed: false });

export const ALL_CARDS =CATEGORIES.flatMap((category) =>
  category.groups.flatMap((group) => group.cards),
);

export function cardHref(name: string) {
  return `/card/${encodeURIComponent(name)}`;
}

// 雙星 → 組成它的兩顆單星；單一主星 → 含有它的雙星組合
export function relatedCards(name: string): string[] {
  const category = CARD_CATEGORY.get(name);
  if (category?.id === "pair") return [name.slice(0, 2), name.slice(2)];
  if (category?.id === "main") {
    return ALL_CARDS.filter(
      (card) => CARD_CATEGORY.get(card)?.id === "pair" && card.includes(name),
    );
  }
  return [];
}

// 一筆三牌紀錄有沒有用到這張牌卡；單一主星也算進含有它的雙星組合
export function usesCard(reading: Record<SlotKey, string>, name: string) {
  return (
    SLOTS.some((slot) => reading[slot.key] === name) ||
    (CARD_CATEGORY.get(name)?.id === "main" && reading.main.includes(name))
  );
}

export const CARD_CATEGORY = new Map<string, Category>(
  CATEGORIES.flatMap((category) =>
    category.groups.flatMap((group) =>
      group.cards.map((card) => [card, category] as const),
    ),
  ),
);
