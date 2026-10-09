"use client";

import { astro, util } from "iztro";
import Link from "next/link";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { CARD_CATEGORY, cardHref } from "../cards";
import { chartStore, useStore, useToday, type ChartProfile } from "../store";
import {
  BAND,
  BAND_INNER,
  BUTTON_GHOST,
  BUTTON_PRIMARY,
  FOCUS,
  INPUT,
  PANEL,
  PageHeading,
} from "../ui";

// 各派有出入的三個天干，明確指定這裡用的四化（依序是祿、權、科、忌）；
// 本命、各層運限和宮干四化都會跟著用這一組。
astro.config({
  mutagens: {
    // 戊：貪陰右機，和 iztro 預設相同，寫出來是為了不受預設值變動影響
    戊: ["貪狼", "太陰", "右弼", "天機"],
    // 庚：陽武同相；iztro 預設是「陽武陰同」
    庚: ["太陽", "武曲", "天同", "天相"],
    // 壬：梁紫左武，和 iztro 預設相同
    壬: ["天梁", "紫微", "左輔", "武曲"],
  },
});

type Astrolabe = ReturnType<typeof astro.bySolar>;
type Palace = Astrolabe["palaces"][number];
type Star = Palace["majorStars"][number];

const TIMES = [
  "早子時 00:00–01:00",
  "丑時 01:00–03:00",
  "寅時 03:00–05:00",
  "卯時 05:00–07:00",
  "辰時 07:00–09:00",
  "巳時 09:00–11:00",
  "午時 11:00–13:00",
  "未時 13:00–15:00",
  "申時 15:00–17:00",
  "酉時 17:00–19:00",
  "戌時 19:00–21:00",
  "亥時 21:00–23:00",
  "晚子時 23:00–24:00",
];

// 宮位在 4×4 方格中的位置［列, 欄］；索引 0 是寅宮，依序到丑宮
const POSITIONS = [
  [4, 1],
  [3, 1],
  [2, 1],
  [1, 1],
  [1, 2],
  [1, 3],
  [1, 4],
  [2, 4],
  [3, 4],
  [4, 4],
  [4, 3],
  [4, 2],
];

// 上方圖例裡「本命」標籤的樣式：只畫框
const NATAL_BADGE = "border border-ink text-ink";

function buildChart(profile: ChartProfile): Astrolabe | null {
  const date = `${profile.year}-${profile.month}-${profile.day}`;
  try {
    const chart =
      profile.calendar === "solar"
        ? astro.bySolar(date, profile.timeIndex, profile.gender, true, "zh-TW")
        : astro.byLunar(
            date,
            profile.timeIndex,
            profile.gender,
            profile.isLeapMonth,
            true,
            "zh-TW",
          );
    placeTianmaByMonth(chart, profile.timeIndex);
    return chart;
  } catch {
    return null;
  }
}

// 本命天馬改用月支安：申子辰月在寅、巳酉丑月在亥、寅午戌月在申、亥卯未月在巳。
// iztro 預設用年支，所以排好盤後把天馬搬到月支對應的宮位。
function placeTianmaByMonth(chart: Astrolabe, timeIndex: number) {
  const { lunarMonth, lunarDay, isLeap } = chart.rawDates.lunarDate;
  // 閏月後半算下個月，和 iztro 安其他月系星的規則一致
  const month = isLeap && lunarDay > 15 && timeIndex !== 12 ? lunarMonth + 1 : lunarMonth;
  // 正月建寅；地支以子為 0
  const monthBranch = (month + 1) % 12;
  const targetBranch = ["寅", "亥", "申", "巳"][monthBranch % 4];
  const target = chart.palaces.find((palace) => palace.earthlyBranch === targetBranch);
  if (!target) return;

  for (const palace of chart.palaces) {
    const index = palace.minorStars.findIndex((star) => star.name === "天馬");
    if (index < 0) continue;
    const [tianma] = palace.minorStars.splice(index, 1);
    target.minorStars.push(tianma);
    return;
  }
}

// 運限的五個層次，由外而內
const LAYERS = [
  { key: "decadal", label: "大限", short: "限", badge: "bg-plum", text: "text-plum" },
  { key: "yearly", label: "流年", short: "年", badge: "bg-mist-deep", text: "text-mist-deep" },
  { key: "monthly", label: "流月", short: "月", badge: "bg-moss", text: "text-moss" },
  { key: "daily", label: "流日", short: "日", badge: "bg-danger", text: "text-danger" },
  { key: "hourly", label: "流時", short: "時", badge: "bg-gold-deep", text: "text-gold-deep" },
] as const;

// 盤面一次最多疊幾層運限，取最靠近所選層次的幾層
const VISIBLE_LAYERS = 3;

const MUTAGEN_NAMES = ["祿", "權", "科", "忌"];

// 不顯示的星曜：魁鉞昌曲和天馬只看本命，所以各層的都隱藏；
// 另外隱藏年解
const HIDDEN_STARS = new Set([
  ...["運", "流", "月", "日", "時"].flatMap((prefix) =>
    ["魁", "鉞", "昌", "曲", "馬"].map((star) => prefix + star),
  ),
  "年解",
  // 流月、流日、流時的鸞喜不顯示；本命、大限、流年的保留
  ...["月", "日", "時"].flatMap((prefix) => [prefix + "鸞", prefix + "喜"]),
]);

// 流曜名稱的第一個字，依層次由外而內
const LAYER_PREFIXES = "運流月日時";
// 各層的祿、羊、陀另外放在格子右下
const CORNER_FLOW_STARS = "祿羊陀";
// 本命的擎羊、陀羅、火星、鈴星用紅色，祿存用綠色
const NATAL_STAR_COLORS: Record<string, string> = {
  擎羊: "text-star-red",
  火星: "text-star-red",
  鈴星: "text-star-red",
  祿存: "text-star-green",
  陀羅: "text-star-red",
};
// 各層運限的祿、羊、陀沿用同樣的顏色；是哪一層看第一個字
const FLOW_STAR_COLORS: Record<string, string> = {
  羊: "text-star-red",
  祿: "text-star-green",
  陀: "text-star-red",
};
// 手機上也要顯示的本命星：雜曜裡的陰煞、蜚廉，和將前十二神的指背
const ALWAYS_SHOWN_STARS = new Set<string>(["陰煞", "蜚廉", "指背"]);
// 本命的紅鸞、天喜用酒紅框線標出
const HIGHLIGHT_NATAL_STARS = new Set(["紅鸞", "天喜"]);
// 運限的鸞、喜用底色塊突顯：流年的是酒紅，大限的是粉紫（流月、流日、流時的不顯示）
const HIGHLIGHT_FLOW_STARS = "鸞喜";

type Horoscope = Pick<
  ReturnType<Astrolabe["horoscope"]>,
  "lunarDate" | "age" | "decadal" | "yearly" | "monthly" | "daily" | "hourly"
>;
type Layer = (typeof LAYERS)[number];
// 某個層次套在盤上的結果
type ActiveLayer = { layer: Layer; item: Horoscope[Layer["key"]] };

// 晚子時，一天裡最後一個時辰
const LAST_TIME_INDEX = 12;

// 指定日期與時辰的大限、流年、流月、流日、流時。
// 流月的干支與四化照農民曆的節氣月（節氣交接換月），流月命宮則用斗君法照農曆月份排。
function getHoroscope(chart: Astrolabe, date: string, timeIndex: number): Horoscope | null {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return null;
  const target = `${year}-${month}-${day}`;
  try {
    const base = chart.horoscope(target, timeIndex);

    // iztro 預設用農曆初一換月；暫時切到節氣分界，取出節氣月的干支、四化與流曜。
    // 交節那一天整天都算新的月份（和農民曆上標的日期一致），不看交節的時刻，
    // 所以固定用當天最後一個時辰來判斷。
    let solarTermMonthly = base.monthly;
    astro.config({ horoscopeDivide: "exact" });
    try {
      solarTermMonthly = chart.horoscope(target, LAST_TIME_INDEX).monthly;
    } finally {
      astro.config({ horoscopeDivide: "normal" });
    }

    // 流月命宮用斗君法、照農曆月份數（iztro 原本的算法）：
    // 從流年命宮起正月逆數到生月，再起子時順數到生時得斗君（正月），然後順數到當月。
    // 干支、四化、流曜則取節氣月的。
    return {
      lunarDate: base.lunarDate,
      age: base.age,
      decadal: base.decadal,
      yearly: base.yearly,
      monthly: {
        ...solarTermMonthly,
        index: base.monthly.index,
        palaceNames: base.monthly.palaceNames,
      },
      daily: base.daily,
      hourly: base.hourly,
    };
  } catch {
    return null;
  }
}

// 現在是哪個時辰；23 點起算晚子時
const subscribeNever = () => () => {};

function getCurrentTimeIndex() {
  const hour = new Date().getHours();
  return hour === 23 ? 12 : Math.floor((hour + 1) / 2);
}

function shiftDate(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(year, month - 1, day + days);
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${next.getFullYear()}-${mm}-${dd}`;
}

function shiftYear(date: string, years: number) {
  const [year, month, day] = date.split("-").map(Number);
  const next = new Date(year + years, month - 1, day);
  const mm = String(next.getMonth() + 1).padStart(2, "0");
  const dd = String(next.getDate()).padStart(2, "0");
  return `${next.getFullYear()}-${mm}-${dd}`;
}

// 點宮位換時間：找出「這一層的命宮落在指定宮位」的最近時間。
// 流時在同一天裡找時辰；流日、流月、流年往前後找最近的日期；大限用那一宮的起始歲數換算年份。
// 回傳要改成的日期或時辰；找不到就回傳 null。
function findTimeForPalace(
  chart: Astrolabe,
  layerKey: Layer["key"],
  palace: number,
  date: string,
  timeIndex: number,
): { date?: string; timeIndex?: number } | null {
  const soulAt = (targetDate: string, targetTime: number) =>
    getHoroscope(chart, targetDate, targetTime)?.[layerKey].index;

  if (layerKey === "hourly") {
    for (let time = 0; time < TIMES.length; time++) {
      if (soulAt(date, time) === palace) return { timeIndex: time };
    }
    return null;
  }

  if (layerKey === "decadal") {
    const current = getHoroscope(chart, date, timeIndex);
    if (!current) return null;
    if (current.decadal.index === palace) return { date };
    const startAge = chart.palaces[palace].decadal.range[0];
    return { date: shiftYear(date, startAge - current.age.nominalAge) };
  }

  // 每一步跨多少、最多找幾步：流日一天一宮；流月每七天看一次一定會落在每個月裡；流年一年一宮
  const search = {
    daily: { step: (n: number) => shiftDate(date, n), limit: 15 },
    monthly: { step: (n: number) => shiftDate(date, n * 7), limit: 30 },
    yearly: { step: (n: number) => shiftYear(date, n), limit: 6 },
  }[layerKey];

  for (let distance = 0; distance <= search.limit; distance++) {
    // 同樣距離時先看往後的時間，再看往前的
    for (const direction of distance === 0 ? [0] : [1, -1]) {
      const candidate = search.step(distance * direction);
      if (soulAt(candidate, timeIndex) === palace) return { date: candidate };
    }
  }
  return null;
}

// 四化的顏色固定：祿綠、權土、科藍、忌紅。本命只畫框，運限填滿。
const MUTAGEN_STYLES = [
  { fill: "bg-star-green text-paper-light", outline: "border border-star-green text-star-green" },
  { fill: "bg-star-earth text-paper-light", outline: "border border-star-earth text-star-earth" },
  { fill: "bg-star-blue text-paper-light", outline: "border border-star-blue text-star-blue" },
  { fill: "bg-star-red text-paper-light", outline: "border border-star-red text-star-red" },
];

// 星名直書，下方是四化（不顯示廟旺平陷）。
// 四化依層級順序排：本命、大限、流年、流月……
// 某一層沒有四化時不留空，下面的層級直接往上遞補。
function StarLabel({
  star,
  layers = [],
  flying = [],
  className = "inline-flex",
}: {
  star: Star;
  // 選到的每一層，由大限開始依序排
  layers?: ActiveLayer[];
  // 點選的宮位用宮干飛出去的四化：依序是化祿、化權、化科、化忌的星
  flying?: string[];
  className?: string;
}) {
  const flyingIndex = flying.indexOf(star.name);
  const VERTICAL = "whitespace-nowrap [writing-mode:vertical-rl]";
  const BADGE =
    "flex h-4 w-4 items-center justify-center rounded text-[10px] leading-none font-normal @5xl:h-[18px] @5xl:w-[18px] @5xl:text-[13px]";

  // 每一格是祿權科忌的第幾個；沒有四化的層級（-1）直接略過
  const used = [
    { label: "本命", natal: true, index: MUTAGEN_NAMES.indexOf(star.mutagen ?? "") },
    ...layers.map(({ layer, item }) => ({
      label: layer.label,
      natal: false,
      index: item.mutagen.indexOf(star.name),
    })),
  ].filter((slot) => slot.index >= 0);

  return (
    <span className={`flex-col items-center gap-px ${className}`}>
      {CARD_CATEGORY.has(star.name) ? (
        <Link
          href={cardHref(star.name)}
          onClick={(event) => event.stopPropagation()}
          className={`${VERTICAL} hover:underline ${FOCUS}`}
        >
          {star.name}
        </Link>
      ) : (
        <span className={VERTICAL}>{star.name}</span>
      )}

      {used.map((slot) => (
        <span
          key={slot.label}
          title={`${slot.label}化${MUTAGEN_NAMES[slot.index]}`}
          className={`${BADGE} ${
            slot.natal ? MUTAGEN_STYLES[slot.index].outline : MUTAGEN_STYLES[slot.index].fill
          }`}
        >
          {MUTAGEN_NAMES[slot.index]}
        </span>
      ))}
      {/* 點選宮位的宮干四化：深色底、外加一圈框線，和本命、運限的四化區分 */}
      {flyingIndex >= 0 && (
        <span
          title={`宮干化${MUTAGEN_NAMES[flyingIndex]}`}
          className={`${BADGE} bg-ink text-paper-light ring-2 ring-gold`}
        >
          {MUTAGEN_NAMES[flyingIndex]}
        </span>
      )}
    </span>
  );
}

function ProfileForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: ChartProfile;
  onSave: (profile: ChartProfile) => void;
  onCancel?: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [calendar, setCalendar] = useState(initial?.calendar ?? "solar");
  const [year, setYear] = useState(initial ? String(initial.year) : "");
  const [month, setMonth] = useState(initial ? String(initial.month) : "");
  const [day, setDay] = useState(initial ? String(initial.day) : "");
  const [isLeapMonth, setIsLeapMonth] = useState(initial?.isLeapMonth ?? false);
  const [timeIndex, setTimeIndex] = useState(initial?.timeIndex ?? 0);
  const [gender, setGender] = useState(initial?.gender ?? "女");
  const [error, setError] = useState("");

  function submit() {
    const profile: ChartProfile = {
      name: name.trim(),
      calendar,
      year: Number(year),
      month: Number(month),
      day: Number(day),
      isLeapMonth: calendar === "lunar" && isLeapMonth,
      timeIndex,
      gender,
    };
    if (!buildChart(profile)) {
      setError("這個日期排不出命盤，請確認年月日是否正確。");
      return;
    }
    onSave(profile);
  }

  const SEGMENT = `flex-1 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink`;

  return (
    <form
      className={`${PANEL} mx-auto flex w-full max-w-xl flex-col gap-5 p-5 sm:p-6`}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <h2 className="text-lg font-medium tracking-[0.12em]">出生資料</h2>

      <div className="flex flex-col gap-1">
        <label htmlFor="chart-name" className="text-sm tracking-widest text-ink-soft">
          稱呼（可不填）
        </label>
        <input
          id="chart-name"
          type="text"
          value={name}
          onChange={(event) => setName(event.target.value)}
          autoComplete="off"
          className={INPUT}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1">
          <span className="text-sm tracking-widest text-ink-soft">性別</span>
          <div
            role="group"
            aria-label="性別"
            className="flex overflow-hidden rounded-full border border-line"
          >
            {(["女", "男"] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={gender === value}
                onClick={() => setGender(value)}
                className={`${SEGMENT} ${
                  gender === value ? "bg-ink text-paper-light" : "hover:bg-paper"
                }`}
              >
                {value}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-sm tracking-widest text-ink-soft">曆法</span>
          <div
            role="group"
            aria-label="曆法"
            className="flex overflow-hidden rounded-full border border-line"
          >
            {(
              [
                ["solar", "國曆"],
                ["lunar", "農曆"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                aria-pressed={calendar === value}
                onClick={() => setCalendar(value)}
                className={`${SEGMENT} ${
                  calendar === value ? "bg-ink text-paper-light" : "hover:bg-paper"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {(
          [
            ["年（西元）", year, setYear, 1900, 2100],
            ["月", month, setMonth, 1, 12],
            ["日", day, setDay, 1, 31],
          ] as const
        ).map(([label, value, setValue, min, max]) => (
          <label key={label} className="flex flex-col gap-1">
            <span className="text-sm tracking-widest text-ink-soft">{label}</span>
            <input
              type="number"
              required
              min={min}
              max={max}
              value={value}
              onChange={(event) => setValue(event.target.value)}
              className={`${INPUT} min-w-0`}
            />
          </label>
        ))}
      </div>

      {calendar === "lunar" && (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={isLeapMonth}
            onChange={(event) => setIsLeapMonth(event.target.checked)}
            className="h-4 w-4 accent-ink"
          />
          這個月是閏月
        </label>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="chart-time" className="text-sm tracking-widest text-ink-soft">
          出生時辰
        </label>
        <select
          id="chart-time"
          value={timeIndex}
          onChange={(event) => setTimeIndex(Number(event.target.value))}
          className={INPUT}
        >
          {TIMES.map((label, index) => (
            <option key={label} value={index}>
              {label}
            </option>
          ))}
        </select>
      </div>

      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
        {onCancel && (
          <button type="button" onClick={onCancel} className={BUTTON_GHOST}>
            取消
          </button>
        )}
        <button type="submit" className={BUTTON_PRIMARY}>
          排盤
        </button>
      </div>
    </form>
  );
}

function PalaceCell({
  palace,
  state,
  layers,
  pinned,
  chipLayers,
  flying,
  onSelect,
}: {
  palace: Palace;
  state: "selected" | "related" | "none";
  layers: ActiveLayer[];
  // 沒有疊在盤上、但鸞喜仍要顯示的層次
  pinned: ActiveLayer[];
  // 選到的所有層次；每一層的宮名和四化都列出來
  chipLayers: ActiveLayer[];
  // 點選的宮位用宮干飛出去的四化
  flying: string[];
  onSelect: () => void;
}) {
  const [row, column] = POSITIONS[palace.index];
  const isSoul = palace.name === "命宮";
  // 這一宮裡要顯示的流曜，帶著所屬層次的顏色
  const flowStars = [
    ...layers.flatMap(({ layer, item }) =>
      (item.stars?.[palace.index] ?? [])
        .filter((star) => !HIDDEN_STARS.has(star.name))
        .map((star) => ({ name: star.name, text: layer.text })),
    ),
    ...pinned.flatMap(({ layer, item }) =>
      (item.stars?.[palace.index] ?? [])
        .filter((star) => HIGHLIGHT_FLOW_STARS.includes(star.name[1]))
        .map((star) => ({ name: star.name, text: layer.text })),
    ),
  ];
  const FLOW_ROW =
    "flex flex-wrap items-start gap-x-0.5 gap-y-1 text-[11px] leading-[1.15] @2xl:text-xs @5xl:text-[15px] @5xl:leading-[1.15]";
  const FLOW_STAR = "whitespace-nowrap [writing-mode:vertical-rl]";
  // 這一宮在某層運限中的宮名小標；是該運限的命宮時填滿底色
  const layerChip = (layer: Layer, item: ActiveLayer["item"]) =>
    `rounded text-center whitespace-nowrap ${
      item.index === palace.index
        ? `${layer.badge} text-paper-light`
        : `bg-paper-light ${layer.text}`
    }`;
  // 超過三層時小標只寫宮名一個字，不寫「限年月日時」，是哪一層看顏色
  const compactChips = chipLayers.length > 3;
  const chipLabel = (layer: Layer, item: ActiveLayer["item"]) =>
    (compactChips ? "" : layer.short) + item.palaceNames[palace.index][0];
  // 電腦版把選到的每一層宮名都排在同一列
  const inlineChipSize = compactChips ? "w-6 text-[15px] leading-6" : "w-9 text-[15px] leading-6";
  return (
    <div
      style={{ gridRow: row, gridColumn: column }}
      onClick={onSelect}
      className={`flex min-h-36 min-w-0 cursor-pointer flex-col overflow-hidden transition-colors @2xl:min-h-44 @5xl:min-h-0 ${
        state === "selected"
          ? "bg-pick"
          : state === "related"
            ? "bg-pick-soft"
            : "bg-paper-light"
      }`}
    >
      {/* 星曜區。電腦版把右下那兩排疊在這一區的右下角，不另外佔高度，整張盤才不會太高 */}
      <div className="relative flex flex-1 flex-col @5xl:min-h-36">
      {/* 星曜直書並排：主星、輔星、雜曜、流曜 */}
      <div className="flex flex-wrap items-start gap-x-1.5 gap-y-1.5 p-1.5 @2xl:p-2 @5xl:gap-x-3 @5xl:gap-y-2 @5xl:p-2.5">
        <div className="flex flex-wrap items-start gap-x-0.5 gap-y-1 text-sm leading-[1.15] font-medium text-taupe-deep @2xl:text-base @5xl:gap-x-1.5 @5xl:text-xl @5xl:leading-[1.15]">
          {palace.majorStars.map((star) => (
            <StarLabel key={star.name} star={star} layers={chipLayers} flying={flying} />
          ))}
        </div>
        <div className="flex flex-wrap items-start gap-x-0.5 gap-y-1 text-xs leading-[1.15] text-mist-deep @2xl:text-sm @5xl:gap-x-1 @5xl:text-base @5xl:leading-[1.15]">
          {/* 擎羊、陀羅、祿存、火星、鈴星另外放到右下，和運限的祿羊陀排在一起 */}
          {palace.minorStars
            .filter((star) => !NATAL_STAR_COLORS[star.name])
            .map((star) => (
              <StarLabel key={star.name} star={star} layers={chipLayers} flying={flying} />
            ))}
        </div>
        {/* 雜曜只在較寬的畫面顯示，手機上省略；紅鸞、天喜、陰煞、蜚廉另外放到右下 */}
        <div className="flex flex-wrap items-start gap-x-0.5 gap-y-1 text-[11px] leading-[1.15] text-ink-soft @2xl:text-xs @5xl:text-sm @5xl:leading-[1.15]">
          {palace.adjectiveStars
            .filter(
              (star) =>
                !HIDDEN_STARS.has(star.name) &&
                !HIGHLIGHT_NATAL_STARS.has(star.name) &&
                !ALWAYS_SHOWN_STARS.has(star.name),
            )
            .map((star) => (
              <StarLabel key={star.name} star={star} className="hidden @2xl:inline-flex" />
            ))}
        </div>
        {/* 運限帶進來的其他流曜 */}
        <div className={FLOW_ROW}>
          {flowStars
            .filter(
              (star) =>
                !CORNER_FLOW_STARS.includes(star.name[1]) &&
                !HIGHLIGHT_FLOW_STARS.includes(star.name[1]),
            )
            .map((star) => (
              <span key={star.name} className={`${FLOW_STAR} ${star.text}`}>
                {star.name}
              </span>
            ))}
        </div>
      </div>

      {/* 右下角固定兩排：上排是陰煞、蜚廉、指背和鸞喜（本命、大限、流年），
          下排是本命的擎羊、陀羅、祿存、火星、鈴星，和各層的祿、羊、陀。
          下排沒有星也保留高度，鸞喜的位置才不會跑掉 */}
      <div className="mt-auto flex flex-col items-end gap-1 px-1.5 pb-1 @5xl:absolute @5xl:right-0 @5xl:bottom-0 @5xl:px-2.5 @5xl:pb-1.5">
        <div className={`justify-end ${FLOW_ROW}`}>
          {/* 陰煞、蜚廉是雜曜；指背是將前十二神落在這一宮的那一顆 */}
          {palace.adjectiveStars
            .filter((star) => ALWAYS_SHOWN_STARS.has(star.name))
            .map((star) => (
              <span key={star.name} className={`${FLOW_STAR} font-medium text-ink`}>
                {star.name}
              </span>
            ))}
          {ALWAYS_SHOWN_STARS.has(palace.jiangqian12) && (
            <span className={`${FLOW_STAR} font-medium text-ink`}>{palace.jiangqian12}</span>
          )}
          {palace.adjectiveStars
            .filter((star) => HIGHLIGHT_NATAL_STARS.has(star.name))
            .map((star) => (
              <span
                key={star.name}
                className={`${FLOW_STAR} rounded-[3px] border border-wine py-0.5 font-medium text-wine`}
              >
                {star.name}
              </span>
            ))}
          {flowStars
            .filter((star) => HIGHLIGHT_FLOW_STARS.includes(star.name[1]))
            .sort((a, b) => LAYER_PREFIXES.indexOf(a.name[0]) - LAYER_PREFIXES.indexOf(b.name[0]))
            .map((star) => (
              <span
                key={star.name}
                className={`${FLOW_STAR} rounded-[3px] py-0.5 text-paper-light ${
                  star.name[0] === "流" ? "bg-wine" : "bg-orchid"
                }`}
              >
                {star.name}
              </span>
            ))}
        </div>
        <div className={`min-h-[2.3em] justify-end ${FLOW_ROW}`}>
          {palace.minorStars
            .filter((star) => NATAL_STAR_COLORS[star.name])
            .map((star) => (
              <StarLabel
                key={star.name}
                star={star}
                layers={chipLayers} flying={flying}
                className={`inline-flex font-medium ${NATAL_STAR_COLORS[star.name]}`}
              />
            ))}
          {flowStars
            .filter((star) => CORNER_FLOW_STARS.includes(star.name[1]))
            .map((star) => (
              <span
                key={star.name}
                className={`${FLOW_STAR} font-medium ${FLOW_STAR_COLORS[star.name[1]] ?? star.text}`}
              >
                {star.name}
              </span>
            ))}
        </div>
      </div>
      </div>

      {/* 宮位資訊：用淡米色底和上方的星曜區隔開 */}
      <div className="flex flex-col gap-1 border-t border-line bg-paper px-1 py-1 @2xl:px-2 @5xl:px-2.5 @5xl:py-1.5">
        {/* 底列由左到右：宮名、長生與大限歲數、運限宮名、宮干支 */}
        <div className="flex items-end gap-0.5 @5xl:gap-1.5">
          <button
            type="button"
            aria-pressed={state === "selected"}
            aria-label={isSoul ? "命宮" : `${palace.name}宮`}
            className={`h-3.5 w-3.5 shrink-0 self-center rounded-[3px] bg-wine text-[9px] leading-[14px] font-medium text-paper-light @2xl:h-6 @2xl:w-6 @2xl:rounded-md @2xl:text-sm @2xl:leading-6 @5xl:h-7 @5xl:w-7 @5xl:rounded-lg @5xl:text-base @5xl:leading-7 ${FOCUS}`}
          >
            {palace.name[0]}
          </button>
          {palace.isBodyPalace && (
            <span className="shrink-0 self-center rounded bg-haze px-0.5 text-[10px] leading-4 @5xl:px-1 @5xl:text-xs @5xl:leading-5">
              身
            </span>
          )}
          <div className="flex flex-col text-ink-soft">
            <span className="text-[10px] leading-3 whitespace-nowrap @2xl:text-xs @2xl:leading-4 @5xl:text-sm @5xl:leading-4">
              {palace.changsheng12}
            </span>
            <span className="text-[9px] leading-3 whitespace-nowrap @2xl:text-[11px] @2xl:leading-4 @5xl:text-[13px] @5xl:leading-4">
              {palace.decadal.range[0]}–{palace.decadal.range[1]}
            </span>
          </div>
          {/* 較寬的畫面：運限宮名夾在大限歲數和干支之間，固定寬度讓各宮對齊 */}
          <div className="ml-auto hidden gap-0.5 @5xl:flex">
            {chipLayers.map(({ layer, item }) => (
              <span key={layer.key} className={`${inlineChipSize} ${layerChip(layer, item)}`}>
                {chipLabel(layer, item)}
              </span>
            ))}
          </div>
          <span className="ml-auto shrink-0 text-[11px] leading-3 text-ink-soft [writing-mode:vertical-rl] @2xl:text-[13px] @2xl:leading-4 @5xl:ml-0 @5xl:text-[15px] @5xl:leading-4">
            {palace.heavenlyStem}
            {palace.earthlyBranch}
          </span>
        </div>
        {/* 手機放不進同一列，改成排在底下等寬的一排 */}
        {chipLayers.length > 0 && (
          <div
            className="grid gap-0.5 @2xl:hidden"
            style={{ gridTemplateColumns: `repeat(${chipLayers.length}, minmax(0, 1fr))` }}
          >
            {chipLayers.map(({ layer, item }) => (
              <span key={layer.key} className={`text-[11px] leading-4 ${layerChip(layer, item)}`}>
                {chipLabel(layer, item)}
              </span>
            ))}
          </div>
        )}
        {/* 中等寬度一樣放在底下，但選到的每一層都列出來 */}
        {chipLayers.length > 0 && (
          <div
            className="hidden gap-0.5 @2xl:grid @5xl:hidden"
            style={{ gridTemplateColumns: `repeat(${chipLayers.length}, minmax(0, 1fr))` }}
          >
            {chipLayers.map(({ layer, item }) => (
              <span key={layer.key} className={`text-[13px] leading-5 ${layerChip(layer, item)}`}>
                {chipLabel(layer, item)}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// 命盤是電腦版寬度時，依瀏覽器視窗等比例縮放：盡量放大，但整張盤要在一個畫面內看得完，
// 所以大螢幕字會變大、小視窗字會變小。回傳縮放比例和縮放後的高度；不需要縮放時回傳 null。
const DESKTOP_CHART_WIDTH = 1024;
const SCREEN_MARGIN = 16;
const MIN_FIT_SCALE = 0.55;
const MAX_FIT_SCALE = 1.6;

function useFitToScreen(ref: React.RefObject<HTMLDivElement | null>) {
  const [fit, setFit] = useState<{ scale: number; height: number } | null>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const update = () => {
      // offsetWidth、offsetHeight 是縮放前的原始尺寸
      const naturalWidth = element.offsetWidth;
      const naturalHeight = element.offsetHeight;
      if (naturalWidth < DESKTOP_CHART_WIDTH || naturalHeight === 0) {
        setFit(null);
        return;
      }
      const byHeight = (window.innerHeight - SCREEN_MARGIN) / naturalHeight;
      const byWidth = (document.documentElement.clientWidth - SCREEN_MARGIN) / naturalWidth;
      const scale = Math.min(MAX_FIT_SCALE, Math.max(MIN_FIT_SCALE, Math.min(byHeight, byWidth)));
      setFit(Math.abs(scale - 1) < 0.01 ? null : { scale, height: naturalHeight * scale });
    };
    // 觀察開始時會先觸發一次，之後盤面內容或視窗大小改變都會重算
    const observer = new ResizeObserver(update);
    observer.observe(element);
    window.addEventListener("resize", update);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [ref]);

  return fit;
}

function ChartView({
  profile,
  chart,
  onEdit,
}: {
  profile: ChartProfile;
  chart: Astrolabe;
  onEdit: () => void;
}) {
  const today = useToday();
  const currentTimeIndex = useSyncExternalStore(
    subscribeNever,
    getCurrentTimeIndex,
    () => 0,
  );
  const [pickedDate, setPickedDate] = useState<string | null>(null);
  const [pickedTime, setPickedTime] = useState<number | null>(null);
  // 選到第幾層：0 只看本命，5 看到流時；一進來就從流時開始
  const [depth, setDepth] = useState<number>(LAYERS.length);
  const [selected, setSelected] = useState<number | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const fit = useFitToScreen(gridRef);

  const date = pickedDate ?? today;
  const timeIndex = pickedTime ?? currentTimeIndex;
  const horoscope = date ? getHoroscope(chart, date, timeIndex) : null;
  const layers: ActiveLayer[] = horoscope
    ? LAYERS.slice(Math.max(0, depth - VISIBLE_LAYERS), depth).map((layer) => ({
        layer,
        item: horoscope[layer.key],
      }))
    : [];
  const isNow = date === today && timeIndex === currentTimeIndex;

  // 日期與時辰那一排的按鈕、輸入框：手機上比較小，才排得進一排
  const CONTROL_BUTTON = `shrink-0 rounded-full bg-paper px-2.5 py-1.5 text-xs whitespace-nowrap transition-colors hover:bg-line disabled:opacity-40 sm:px-6 sm:py-2.5 sm:text-sm sm:tracking-[0.12em] ${FOCUS}`;
  const CONTROL_INPUT = `rounded-lg border border-line bg-paper-light px-1.5 py-1.5 text-xs sm:px-4 sm:py-2.5 sm:text-base ${FOCUS}`;
  // 三方四正：本宮、對宮與兩個三合宮
  // 選到的每一層（不只盤上疊的三層），用來列出各層的宮名和四化
  const chipLayers: ActiveLayer[] = horoscope
    ? LAYERS.slice(0, depth).map((layer) => ({ layer, item: horoscope[layer.key] }))
    : [];

  // 大限和流年的鸞喜一直顯示：盤上只疊最近的三層，這兩層沒被疊上去時，鸞喜另外補上
  const pinned: ActiveLayer[] = horoscope
    ? LAYERS.slice(0, Math.min(depth, 2))
        .filter((pin) => !layers.some(({ layer }) => layer.key === pin.key))
        .map((layer) => ({ layer, item: horoscope[layer.key] }))
    : [];

  // 沒有手動點選時，自動以所選層次（大限、流年、流月、流日、流時）的命宮為準
  const autoFocus =
    depth > 0 && horoscope ? horoscope[LAYERS[depth - 1].key].index : null;
  const focus = selected ?? autoFocus;
  const related =
    focus === null ? [] : [(focus + 6) % 12, (focus + 4) % 12, (focus + 8) % 12];

  // 點宮位：只看本命時標出三方四正並飛宮干四化；
  // 選了運限層次時，改成跳到「那一層命宮落在這一宮」的時間，盤面就換成那個時間的四化
  function clickPalace(index: number) {
    if (depth === 0 || !date) {
      setSelected(selected === index ? null : index);
      return;
    }
    const target = findTimeForPalace(chart, LAYERS[depth - 1].key, index, date, timeIndex);
    if (!target) return;
    if (target.date !== undefined) setPickedDate(target.date);
    if (target.timeIndex !== undefined) setPickedTime(target.timeIndex);
    setSelected(null);
  }

  // 手動點了某一宮時，用那一宮的宮干飛四化；沒有點選時不飛
  const flyingFrom = selected === null ? null : chart.palaces[selected];
  const flying: string[] = flyingFrom
    ? util.getMutagensByHeavenlyStem(flyingFrom.heavenlyStem)
    : [];

  // 換日期、時辰或層次時，放掉手動點選的宮位，回到自動標示
  function changeDate(value: string | null) {
    setPickedDate(value);
    setSelected(null);
  }
  function changeTime(value: number | null) {
    setPickedTime(value);
    setSelected(null);
  }
  function changeDepth(value: number) {
    setDepth(value);
    setSelected(null);
  }

  const facts = [
    ["國曆", chart.solarDate],
    ["農曆", chart.lunarDate],
    ["干支", chart.chineseDate],
    ["時辰", chart.time],
    ["五行", chart.fiveElementsClass],
    ["命主", chart.soul],
    ["身主", chart.body],
    ["生肖", chart.zodiac],
  ];

  return (
    <div className="flex flex-col gap-4">
      {/* 運限：選日期、時辰與要看到哪一層 */}
      <section className={`${PANEL} flex flex-col gap-4 p-4 sm:p-5`}>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
          {/* 手機上縮成一排：前後一日用箭頭，時辰只露出名稱 */}
          <div className="flex w-full items-center gap-1 sm:w-auto sm:flex-wrap sm:gap-2">
            <button
              type="button"
              aria-label="前一日"
              onClick={() => date && changeDate(shiftDate(date, -1))}
              className={CONTROL_BUTTON}
            >
              <span aria-hidden className="sm:hidden">
                ‹
              </span>
              <span className="hidden sm:inline">前一日</span>
            </button>
            <label htmlFor="chart-date" className="sr-only">
              運限日期
            </label>
            <input
              id="chart-date"
              type="date"
              value={date}
              onChange={(event) => changeDate(event.target.value || null)}
              className={`min-w-0 flex-1 sm:flex-none ${CONTROL_INPUT}`}
            />
            <button
              type="button"
              aria-label="後一日"
              onClick={() => date && changeDate(shiftDate(date, 1))}
              className={CONTROL_BUTTON}
            >
              <span aria-hidden className="sm:hidden">
                ›
              </span>
              <span className="hidden sm:inline">後一日</span>
            </button>
            <label htmlFor="chart-hour" className="sr-only">
              運限時辰
            </label>
            <select
              id="chart-hour"
              value={timeIndex}
              onChange={(event) => changeTime(Number(event.target.value))}
              className={`w-[4.25rem] shrink-0 sm:w-auto ${CONTROL_INPUT}`}
            >
              {TIMES.map((label, index) => (
                <option key={label} value={index}>
                  {label}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => {
                changeDate(null);
                changeTime(null);
              }}
              disabled={isNow}
              className={CONTROL_BUTTON}
            >
              現在
            </button>
          </div>

          <div
            role="group"
            aria-label="顯示層次"
            className="grid w-full grid-cols-6 overflow-hidden rounded-full border border-line sm:w-auto"
          >
            {["本命", ...LAYERS.map((layer) => layer.label)].map((label, index) => (
              <button
                key={label}
                type="button"
                aria-pressed={depth === index}
                onClick={() => changeDepth(index)}
                className={`px-1 py-2 text-xs transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink sm:px-4 sm:text-sm ${
                  depth === index ? "bg-ink text-paper-light" : "hover:bg-paper"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {horoscope ? (
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="text-ink-soft">
              農曆 {horoscope.lunarDate}・虛歲 {horoscope.age.nominalAge}
            </span>
            <span
              className={`rounded-full px-2 text-xs leading-5 ${NATAL_BADGE}`}
            >
              本命
            </span>
            {chipLayers.map(({ layer, item }) => (
              <span key={layer.key} className="flex items-center gap-1.5">
                <span
                  className={`rounded-full px-2 text-xs leading-5 text-paper-light ${layer.badge}`}
                >
                  {layer.label}
                </span>
                {item.heavenlyStem}
                {item.earthlyBranch}
              </span>
            ))}
          </p>
        ) : (
          <p className="text-sm text-ink-soft">請選擇日期。</p>
        )}

        {/* 點了宮位之後，列出那一宮宮干飛出去的四化 */}
        {flyingFrom && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-sm">
            <span className="rounded-full bg-ink px-2 text-xs leading-5 text-paper-light ring-2 ring-gold">
              宮干四化
            </span>
            <span>
              {flyingFrom.name === "命宮" ? "命宮" : `${flyingFrom.name}宮`}（{flyingFrom.heavenlyStem}
              {flyingFrom.earthlyBranch}）
            </span>
            {flying.map((star, index) => (
              <span key={MUTAGEN_NAMES[index]} className="whitespace-nowrap">
                <span className="text-ink-soft">{MUTAGEN_NAMES[index]}</span> {star}
              </span>
            ))}
            <button
              type="button"
              onClick={() => setSelected(null)}
              className={`text-ink-soft underline underline-offset-4 hover:text-ink ${FOCUS}`}
            >
              取消
            </button>
          </p>
        )}
      </section>

      <div className="@container">
      {/* 電腦版把整張盤依視窗等比例縮放到一個畫面看得完；外層保留縮放後的高度 */}
      <div style={fit ? { height: fit.height } : undefined}>
      <div
        ref={gridRef}
        style={fit ? { transform: `scale(${fit.scale})`, transformOrigin: "top center" } : undefined}
        className="grid grid-cols-4 gap-px overflow-hidden rounded-xl border border-line-strong bg-line-strong shadow-[0_8px_24px_-14px_rgb(58_47_41/0.35)]"
      >
        {chart.palaces.map((palace) => (
          <PalaceCell
            key={palace.index}
            palace={palace}
            layers={layers}
            pinned={pinned}
            chipLayers={chipLayers}
            flying={flying}
            state={
              focus === palace.index
                ? "selected"
                : related.includes(palace.index)
                  ? "related"
                  : "none"
            }
            onSelect={() => clickPalace(palace.index)}
          />
        ))}

        <div
          style={{ gridRow: "2 / span 2", gridColumn: "2 / span 2" }}
          className="flex min-w-0 bg-paper-faint p-1 @5xl:p-2"
        >
          {/* 中央的白色圓角方塊；四周留一圈淺色間隙，和十二宮隔開 */}
          <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-line bg-paper-light p-2 text-center @5xl:gap-5 @5xl:rounded-3xl @5xl:p-5">
          <p className="font-medium tracking-[0.12em] @2xl:text-xl @5xl:text-2xl">
            {profile.name || "我的命盤"}
            <span className="ml-2 text-xs font-normal tracking-normal text-ink-soft @5xl:text-sm">
              {chart.gender}
            </span>
          </p>
          <dl className="grid grid-cols-[auto_auto] gap-x-2 gap-y-0.5 text-left text-[11px] leading-4 @2xl:gap-x-3 @2xl:text-sm @2xl:leading-5 @5xl:gap-x-5 @5xl:gap-y-1.5 @5xl:text-base @5xl:leading-6">
            {facts.map(([label, value]) => (
              <div key={label} className="contents">
                <dt className="text-ink-soft">{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
          <button
            type="button"
            onClick={onEdit}
            className={`rounded-full border border-line bg-paper-light px-3 py-1.5 text-xs transition-colors hover:bg-line @5xl:px-6 @5xl:py-2.5 @5xl:text-sm ${FOCUS}`}
          >
            修改出生資料
          </button>
          </div>
        </div>
      </div>
      </div>
      </div>
    </div>
  );
}

export default function ChartPage() {
  const profile = useStore(chartStore)[0];
  const [editing, setEditing] = useState(false);
  const chart = profile ? buildChart(profile) : null;

  function save(next: ChartProfile) {
    chartStore.save([next]);
    setEditing(false);
  }

  return (
    <main className="flex flex-1 flex-col">
      <PageHeading compact en="My Chart" zh="命盤" note="紫微斗數個人命盤" />

      <div className={BAND}>
        <div className={BAND_INNER}>
          {!profile || !chart || editing ? (
            <ProfileForm
              initial={profile}
              onSave={save}
              onCancel={profile && chart ? () => setEditing(false) : undefined}
            />
          ) : (
            <ChartView profile={profile} chart={chart} onEdit={() => setEditing(true)} />
          )}
        </div>
      </div>
    </main>
  );
}
