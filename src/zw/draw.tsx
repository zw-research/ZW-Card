import { useState } from "react";
import { BUTTON_PRIMARY, FOCUS, INPUT } from "./ui";

const STEMS = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
// 數字換干支（規格 v1.1）：天干「四起甲」＝數 % 10；地支「一子起算」＝數 % 12
const STEM_BY_REM = "庚辛壬癸甲乙丙丁戊己";
const BRANCH_BY_REM = "亥子丑寅卯辰巳午未申酉戌";
export const stemOf = (n: string) => STEM_BY_REM[Number(BigInt(n) % 10n)];
export const branchOf = (n: string) => BRANCH_BY_REM[Number(BigInt(n) % 12n)];

// 按下當下的時間：分鐘 → 天干（÷10），小時換 12 小時制 → 地支（÷12）；0 點與 12 點都算 12
export function timeNumbers(at = new Date()): [string, string] {
  return [String(at.getMinutes()), String(at.getHours() % 12 || 12)];
}

type Mode = "both" | "stem" | "branch";
type Source = "random" | "number" | "time";
type Result = { stem?: string; branch?: string; nums?: [string?, string?]; time?: boolean; at: string };

// 用瀏覽器的密碼學亂數，比 Math.random 更均勻
export function randomIndex(size: number) {
  const values = new Uint32Array(1);
  const limit = Math.floor(0x100000000 / size) * size;
  do {
    crypto.getRandomValues(values);
  } while (values[0] >= limit);
  return values[0] % size;
}

const clock = () => new Date().toLocaleTimeString("zh-TW", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const clean = (value: string) => value.trim().replace(/^0+(?=\d)/, "");
const isNum = (value: string) => /^\d+$/.test(value.trim());

function label(result: Result) {
  return `${result.stem ?? ""}${result.branch ?? ""}`;
}

function detail(result: Result) {
  if (!result.nums) return "";
  const [a, b] = result.nums;
  const parts = [];
  const t = result.time;
  if (a !== undefined) parts.push(`${t ? "分 " : ""}${a} ÷ 10 餘 ${BigInt(a) % 10n} → ${result.stem}`);
  if (b !== undefined) parts.push(`${t ? "時 " : ""}${b} ÷ 12 餘 ${BigInt(b) % 12n} → ${result.branch}`);
  return parts.join("；");
}

export function DrawView() {
  const [mode, setMode] = useState<Mode>("both");
  const [source, setSource] = useState<Source>("random");
  const [inputs, setInputs] = useState<[string, string]>(["", ""]);
  const [history, setHistory] = useState<Result[]>([]);
  const current = history[0];
  const useStem = mode !== "branch";
  const useBranch = mode !== "stem";
  const ready = source !== "number" || ((!useStem || isNum(inputs[0])) && (!useBranch || isNum(inputs[1])));

  function run() {
    let result: Result;
    if (source === "random") {
      result = {
        stem: useStem ? STEMS[randomIndex(10)] : undefined,
        branch: useBranch ? BRANCHES[randomIndex(12)] : undefined,
        at: clock(),
      };
    } else {
      const now = timeNumbers();
      const a = useStem ? (source === "time" ? now[0] : clean(inputs[0])) : undefined;
      const b = useBranch ? (source === "time" ? now[1] : clean(inputs[1])) : undefined;
      result = { time: source === "time", stem: a !== undefined ? stemOf(a) : undefined, branch: b !== undefined ? branchOf(b) : undefined, nums: [a, b], at: clock() };
    }
    setHistory((list) => [result, ...list].slice(0, 20));
  }

  const MODES: [Mode, string][] = [
    ["both", "天干＋地支"],
    ["stem", "只抽天干"],
    ["branch", "只抽地支"],
  ];
  const segment = (on: boolean) =>
    `py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink ${on ? "bg-ink text-paper-light" : "text-ink-soft"}`;

  return (
    <div className="mx-auto flex w-full max-w-md flex-col gap-4 px-3 py-4">
      <div role="group" aria-label="抽取方式" className="grid grid-cols-3 overflow-hidden rounded-full border border-line bg-paper-light">
        {MODES.map(([key, text]) => (
          <button key={key} type="button" aria-pressed={mode === key} onClick={() => setMode(key)} className={segment(mode === key)}>
            {text}
          </button>
        ))}
      </div>
      <div role="group" aria-label="來源" className="grid grid-cols-3 overflow-hidden rounded-full border border-line bg-paper-light">
        <button type="button" aria-pressed={source === "random"} onClick={() => setSource("random")} className={segment(source === "random")}>
          隨機
        </button>
        <button type="button" aria-pressed={source === "number"} onClick={() => setSource("number")} className={segment(source === "number")}>
          輸入數字
        </button>
        <button type="button" aria-pressed={source === "time"} onClick={() => setSource("time")} className={segment(source === "time")}>
          當下時間
        </button>
      </div>
      {source === "time" && <p className="-mt-2 text-center text-xs text-ink-soft">按下去那一刻：分鐘 ÷ 10 取天干，小時（12 小時制）÷ 12 取地支</p>}
      {source === "number" && (
        <div className="flex items-center justify-center gap-2 text-sm">
          {useStem && (
            <input
              aria-label="數一（天干）"
              inputMode="numeric"
              value={inputs[0]}
              onChange={(event) => setInputs([event.target.value, inputs[1]])}
              placeholder="數一→天干"
              className={`${INPUT} w-32 py-1.5`}
            />
          )}
          {useBranch && (
            <input
              aria-label="數二（地支）"
              inputMode="numeric"
              value={inputs[1]}
              onChange={(event) => setInputs([inputs[0], event.target.value])}
              placeholder="數二→地支"
              className={`${INPUT} w-32 py-1.5`}
            />
          )}
        </div>
      )}

      <div className="flex flex-col items-center gap-2 border border-line bg-paper-light px-4 py-8">
        {current ? (
          <>
            <span aria-live="polite" className="text-4xl font-medium tracking-[0.3em]">
              {label(current)}
            </span>
            <span className="text-center text-xs text-ink-soft">
              {detail(current) && (
                <>
                  {detail(current)}
                  <br />
                </>
              )}
              {current.at}
            </span>
          </>
        ) : (
          <span className="text-sm text-ink-soft">{source === "number" ? "輸入數字後按換算" : "按下面的按鈕抽一次"}</span>
        )}
      </div>

      <button type="button" disabled={!ready} onClick={run} className={`${BUTTON_PRIMARY} py-3`}>
        {source === "number" ? "換算" : source === "time" ? "取時間" : "抽"}
      </button>

      {history.length > 1 && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-sm tracking-widest text-ink-soft">剛才的結果</span>
            <button type="button" onClick={() => setHistory([])} className={`text-xs text-ink-soft underline underline-offset-4 ${FOCUS}`}>
              清除
            </button>
          </div>
          <ul className="flex flex-wrap gap-2">
            {history.slice(1).map((result, index) => (
              <li key={index} className="rounded-full bg-paper-light px-3 py-1 text-sm">
                {label(result)}
                {result.nums && <span className="ml-1.5 text-xs text-ink-soft">{result.nums.filter((n) => n !== undefined).join(",")}</span>}
                <span className="ml-1.5 text-xs text-ink-soft">{result.at.slice(0, 5)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
