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
        cards: ["紫微天府", "紫微貪狼", "紫微天相", "紫微七殺", "紫微破軍"],
      },
      {
        name: "天機系",
        cards: ["天機太陰", "天機巨門", "天機天梁"],
      },
      {
        name: "太陽系",
        cards: ["太陽太陰", "太陽巨門", "太陽天梁"],
      },
      {
        name: "武曲系",
        cards: ["武曲天府", "武曲貪狼", "武曲天相", "武曲七殺", "武曲破軍"],
      },
      {
        name: "天同系",
        cards: ["天同太陰", "天同巨門", "天同天梁"],
      },
      {
        name: "廉貞系",
        cards: ["廉貞天府", "廉貞貪狼", "廉貞天相", "廉貞七殺", "廉貞破軍"],
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
        cards: ["祿存", "鸞喜", "天刑", "空劫"],
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

export const ALL_CARDS = CATEGORIES.flatMap((category) =>
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
