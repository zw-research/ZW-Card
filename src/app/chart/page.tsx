"use client";

import { astro } from "iztro";
import Link from "next/link";
import { useState, useSyncExternalStore } from "react";
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

// 本命四化用紅框、不填底色；各層運限的底色定義在 LAYERS
const NATAL_BADGE = "border border-star-red text-star-red";

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
// 本命的擎羊、火星、鈴星用紅色，祿存用綠色，陀羅用藍色
const NATAL_STAR_COLORS: Record<string, string> = {
  擎羊: "text-star-red",
  火星: "text-star-red",
  鈴星: "text-star-red",
  祿存: "text-star-green",
  陀羅: "text-star-blue",
};
// 各層運限的祿、羊、陀沿用同樣的顏色；是哪一層看第一個字
const FLOW_STAR_COLORS: Record<string, string> = {
  羊: "text-star-red",
  祿: "text-star-green",
  陀: "text-star-blue",
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

// 星名直書：由上而下依序是星名、本命四化、運限四化（不顯示廟旺平陷）
function StarLabel({
  star,
  layers = [],
  className = "inline-flex",
}: {
  star: Star;
  // 選到的每一層；每一層的四化都列出來
  layers?: ActiveLayer[];
  className?: string;
}) {
  const VERTICAL = "whitespace-nowrap [writing-mode:vertical-rl]";
  const BADGE =
    "w-4 rounded text-center text-[10px] leading-4 font-normal @5xl:w-5 @5xl:text-xs @5xl:leading-5";
  return (
    <span className={`flex-col items-center gap-0.5 ${className}`}>
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

      {star.mutagen && (
        <span title={`本命化${star.mutagen}`} className={`${BADGE} ${NATAL_BADGE}`}>
          {star.mutagen}
        </span>
      )}
      {/* 運限四化：只寫祿權科忌，用底色區分是哪一層 */}
      {layers.map(({ layer, item }) => {
        const index = item.mutagen.indexOf(star.name);
        if (index < 0) return null;
        return (
          <span
            key={layer.key}
            title={`${layer.label}化${MUTAGEN_NAMES[index]}`}
            className={`${BADGE} text-paper-light ${layer.badge}`}
          >
            {MUTAGEN_NAMES[index]}
          </span>
        );
      })}
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
  onSelect,
}: {
  palace: Palace;
  state: "selected" | "related" | "none";
  layers: ActiveLayer[];
  // 沒有疊在盤上、但鸞喜仍要顯示的層次
  pinned: ActiveLayer[];
  // 選到的所有層次；每一層的宮名和四化都列出來
  chipLayers: ActiveLayer[];
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
    "flex flex-wrap items-start gap-x-0.5 gap-y-1 text-[11px] leading-[1.15] @2xl:text-xs @5xl:text-sm @5xl:leading-[1.15]";
  const FLOW_STAR = "whitespace-nowrap [writing-mode:vertical-rl]";
  // 這一宮在某層運限中的宮名小標；是該運限的命宮時填滿底色
  const layerChip = (layer: Layer, item: ActiveLayer["item"]) =>
    `rounded text-center whitespace-nowrap ${
      item.index === palace.index
        ? `${layer.badge} text-paper-light`
        : `bg-paper-light ${layer.text}`
    }`;
  // 電腦版把選到的每一層宮名都排在同一列；層數越多，每個小標越窄
  const inlineChipSize =
    chipLayers.length <= 3
      ? "w-9 text-[15px] leading-6"
      : chipLayers.length === 4
        ? "w-8 text-[13px] leading-6"
        : "w-[25px] text-xs leading-6";
  return (
    <div
      style={{ gridRow: row, gridColumn: column }}
      onClick={onSelect}
      className={`flex min-h-36 min-w-0 cursor-pointer flex-col overflow-hidden transition-colors @2xl:min-h-44 @5xl:min-h-52 ${
        state === "selected"
          ? "bg-pick"
          : state === "related"
            ? "bg-pick-soft"
            : "bg-paper-light"
      }`}
    >
      {/* 星曜直書並排：主星、輔星、雜曜、流曜 */}
      <div className="flex flex-wrap items-start gap-x-1.5 gap-y-1.5 p-1.5 @2xl:p-2 @5xl:gap-x-3 @5xl:gap-y-2 @5xl:p-3">
        <div className="flex flex-wrap items-start gap-x-0.5 gap-y-1 text-sm leading-[1.15] font-medium text-taupe-deep @2xl:text-base @5xl:gap-x-1.5 @5xl:text-xl @5xl:leading-[1.15]">
          {palace.majorStars.map((star) => (
            <StarLabel key={star.name} star={star} layers={chipLayers} />
          ))}
        </div>
        <div className="flex flex-wrap items-start gap-x-0.5 gap-y-1 text-xs leading-[1.15] text-mist-deep @2xl:text-sm @5xl:gap-x-1 @5xl:text-base @5xl:leading-[1.15]">
          {/* 擎羊、陀羅、祿存、火星、鈴星另外放到右下，和運限的祿羊陀排在一起 */}
          {palace.minorStars
            .filter((star) => !NATAL_STAR_COLORS[star.name])
            .map((star) => (
              <StarLabel key={star.name} star={star} layers={chipLayers} />
            ))}
        </div>
        {/* 雜曜只在較寬的畫面顯示，手機上省略；紅鸞、天喜另外放到右下。
            陰煞、蜚廉和指背例外：任何寬度都顯示，並用深色粗體排在最前面 */}
        <div className="flex flex-wrap items-start gap-x-0.5 gap-y-1 text-[11px] leading-[1.15] text-ink-soft @2xl:text-xs @5xl:text-[13px] @5xl:leading-[1.15]">
          {palace.adjectiveStars
            .filter((star) => ALWAYS_SHOWN_STARS.has(star.name))
            .map((star) => (
              <StarLabel
                key={star.name}
                star={star}
                className="inline-flex font-medium text-ink"
              />
            ))}
          {/* 指背不是雜曜，是將前十二神落在這一宮的那一顆 */}
          {ALWAYS_SHOWN_STARS.has(palace.jiangqian12) && (
            <span className={`${FLOW_STAR} font-medium text-ink`}>{palace.jiangqian12}</span>
          )}
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

      {/* 右下角固定兩排：上排是鸞喜（本命、大限、流年、流月、流日、流時），
          下排是本命的擎羊、陀羅、祿存、火星、鈴星，和各層的祿、羊、陀。
          下排沒有星也保留高度，鸞喜的位置才不會跑掉 */}
      <div className="mt-auto flex flex-col items-end gap-1 px-1.5 pb-1 @5xl:px-3 @5xl:pb-2">
        <div className={`justify-end ${FLOW_ROW}`}>
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
                layers={chipLayers}
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

      {/* 宮位資訊：用淡米色底和上方的星曜區隔開 */}
      <div className="flex flex-col gap-1 border-t border-line bg-paper px-1 py-1 @2xl:px-2 @5xl:px-3 @5xl:py-2">
        {/* 底列由左到右：宮名、長生與大限歲數、運限宮名、宮干支 */}
        <div className="flex items-end gap-0.5 @5xl:gap-1.5">
          <button
            type="button"
            aria-pressed={state === "selected"}
            aria-label={isSoul ? "命宮" : `${palace.name}宮`}
            className={`h-3.5 w-3.5 shrink-0 self-center rounded-[3px] bg-wine text-[9px] leading-[14px] font-medium text-paper-light @2xl:h-6 @2xl:w-6 @2xl:rounded-md @2xl:text-sm @2xl:leading-6 @5xl:h-8 @5xl:w-8 @5xl:rounded-lg @5xl:text-base @5xl:leading-8 ${FOCUS}`}
          >
            {palace.name[0]}
          </button>
          {palace.isBodyPalace && (
            <span className="shrink-0 self-center rounded bg-haze px-0.5 text-[10px] leading-4 @5xl:px-1 @5xl:text-xs @5xl:leading-5">
              身
            </span>
          )}
          <div className="flex flex-col text-ink-soft">
            <span className="text-[10px] leading-3 whitespace-nowrap @2xl:text-xs @2xl:leading-4 @5xl:text-[13px] @5xl:leading-4">
              {palace.changsheng12}
            </span>
            <span className="text-[9px] leading-3 whitespace-nowrap @2xl:text-[11px] @2xl:leading-4 @5xl:text-xs @5xl:leading-4">
              {palace.decadal.range[0]}–{palace.decadal.range[1]}
            </span>
          </div>
          {/* 較寬的畫面：運限宮名夾在大限歲數和干支之間，固定寬度讓各宮對齊 */}
          <div className="ml-auto hidden gap-0.5 @5xl:flex">
            {chipLayers.map(({ layer, item }) => (
              <span key={layer.key} className={`${inlineChipSize} ${layerChip(layer, item)}`}>
                {layer.short}
                {item.palaceNames[palace.index][0]}
              </span>
            ))}
          </div>
          <span className="ml-auto shrink-0 text-[11px] leading-3 text-ink-soft [writing-mode:vertical-rl] @2xl:text-[13px] @2xl:leading-4 @5xl:ml-0 @5xl:text-[15px] @5xl:leading-4">
            {palace.heavenlyStem}
            {palace.earthlyBranch}
          </span>
        </div>
        {/* 手機放不進同一列，改成排在底下：一排最多三個，超過就折成第二排 */}
        {chipLayers.length > 0 && (
          <div
            className="grid gap-0.5 @2xl:hidden"
            style={{
              gridTemplateColumns: `repeat(${Math.min(chipLayers.length, 3)}, minmax(0, 1fr))`,
            }}
          >
            {chipLayers.map(({ layer, item }) => (
              <span key={layer.key} className={`text-[11px] leading-4 ${layerChip(layer, item)}`}>
                {layer.short}
                {item.palaceNames[palace.index][0]}
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
                {layer.short}
                {item.palaceNames[palace.index][0]}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
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
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => date && changeDate(shiftDate(date, -1))}
              className={BUTTON_GHOST}
            >
              前一日
            </button>
            <label htmlFor="chart-date" className="sr-only">
              運限日期
            </label>
            <input
              id="chart-date"
              type="date"
              value={date}
              onChange={(event) => changeDate(event.target.value || null)}
              className={INPUT}
            />
            <button
              type="button"
              onClick={() => date && changeDate(shiftDate(date, 1))}
              className={BUTTON_GHOST}
            >
              後一日
            </button>
            <label htmlFor="chart-hour" className="sr-only">
              運限時辰
            </label>
            <select
              id="chart-hour"
              value={timeIndex}
              onChange={(event) => changeTime(Number(event.target.value))}
              className={INPUT}
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
              className={BUTTON_GHOST}
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
      </section>

      <div className="@container">
      <div className="grid grid-cols-4 gap-px overflow-hidden rounded-xl border border-line-strong bg-line-strong shadow-[0_8px_24px_-14px_rgb(58_47_41/0.35)]">
        {chart.palaces.map((palace) => (
          <PalaceCell
            key={palace.index}
            palace={palace}
            layers={layers}
            pinned={pinned}
            chipLayers={chipLayers}
            state={
              focus === palace.index
                ? "selected"
                : related.includes(palace.index)
                  ? "related"
                  : "none"
            }
            onSelect={() => setSelected(selected === palace.index ? null : palace.index)}
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
