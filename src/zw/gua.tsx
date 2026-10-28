import { useState } from "react";
import { ChartView, GUA_PALACES, TIMES, buildChart, guaBoardText, guaMutagenText, toggleBlock, type Gua } from "./chart";
import { explain, normId, type Mcp } from "./cases";
import { branchOf, randomIndex, stemOf, timeNumbers } from "./draw";
import type { ChartProfile } from "./store";
import { BUTTON_GHOST, BUTTON_PRIMARY, FOCUS, INPUT } from "./ui";

const SERVER = "Notion";
const CASE_SOURCE = "3a1eb16a-24f4-80aa-bb7c-000b6f53edb4";
const BRANCH_ORDER = "子丑寅卯辰巳午未申酉戌亥";
const SUBJECTS = ["自己", "對方", "事件本體", "關係本體"];
const MODE_LABEL = { B: "B 卦命宮定位", A: "A 指定用宮定位" } as const;

type Mode = "A" | "B";
type Source = "隨機" | "手動" | "時間";
export type GuaPerson = ChartProfile & { id: string; group: string };
export type GuaSetup = { mode: Mode; subject: string; main: string; aux: string[] };
export type GuaInit = {
  personId: string | null;
  stem: string;
  branch: string;
  question?: string;
  at?: string;
  source?: Source;
  numbers?: [string, string];
} & GuaSetup;

export { stemOf, branchOf };

// 抽卦當下：本地日期、時辰（23 點起算晚子時，和命盤的算法相同）
type Moment = { iso: string; date: string; timeIndex: number; label: string };
function momentOf(value: Date): Moment {
  const pad = (n: number) => String(n).padStart(2, "0");
  const hour = value.getHours();
  const timeIndex = hour === 23 ? 12 : Math.floor((hour + 1) / 2);
  const date = `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(value.getDate())}`;
  const label = `${value.getFullYear()}/${value.getMonth() + 1}/${value.getDate()} ${pad(hour)}:${pad(value.getMinutes())}（${TIMES[timeIndex].split(" ")[0]}）`;
  return { iso: value.toISOString(), date, timeIndex, label };
}

// 接受「福德」「福德宮」，以及常見別名（僕役／奴僕＝交友、事業＝官祿）
const ALIASES: Record<string, string> = { 僕役: "交友", 奴僕: "交友", 事業: "官祿", 兄弟宮: "兄弟" };
const fullPalace = (raw: string) => {
  const text = raw.trim();
  if (!text) return null;
  const bare = text === "命宮" || text === "命" ? "命宮" : text.replace(/宮$/, "");
  const name = ALIASES[bare] ?? bare;
  return GUA_PALACES.find((p) => p === name || (name.length === 1 && p.startsWith(name))) ?? null;
};

// 「卦」欄位文字。新格式：丁亥｜B｜對方｜主:官祿｜輔:夫妻、福德｜手動 17,36
// 舊格式：甲子｜官祿（當作 A 模式）
export function guaText(g: Omit<GuaInit, "personId" | "question" | "at">) {
  const parts = [`${g.stem}${g.branch}`, g.mode, g.subject, `主:${g.main}`];
  if (g.aux.length) parts.push(`輔:${g.aux.join("、")}`);
  if (g.source) parts.push(g.numbers ? `${g.source} ${g.numbers.join(",")}` : g.source);
  return parts.join("｜");
}

export function parseGuaText(text: string): Omit<GuaInit, "personId" | "question" | "at"> | null {
  const parts = (text || "").trim().split(/\s*[｜|]\s*/);
  const head = parts[0]?.match(/^([甲乙丙丁戊己庚辛壬癸])([子丑寅卯辰巳午未申酉戌亥])$/);
  if (!head) return null;
  const base = { stem: head[1], branch: head[2] };
  if (parts[1] !== "A" && parts[1] !== "B") {
    const main = fullPalace(parts[1] ?? "") ?? "命宮";
    return { ...base, mode: "A", subject: "", main, aux: [] };
  }
  const result: Omit<GuaInit, "personId" | "question" | "at"> = { ...base, mode: parts[1], subject: parts[2] ?? "", main: "命宮", aux: [] };
  for (const part of parts.slice(3)) {
    if (part.startsWith("主:")) result.main = fullPalace(part.slice(2)) ?? "命宮";
    else if (part.startsWith("輔:")) result.aux = part.slice(2).split(/[、,]/).map(fullPalace).filter((x): x is string => !!x);
    else {
      const m = part.match(/^(隨機|手動|時間)(?:\s+(\d+),(\d+))?$/);
      if (m) {
        result.source = m[1] as Source;
        if (m[2]) result.numbers = [m[2], m[3]];
      }
    }
  }
  return result;
}

function today() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

const LABEL = "text-sm tracking-widest text-ink-soft";
const chip = (on: boolean, locked: boolean) =>
  `rounded-full px-2.5 py-1 text-sm ${FOCUS} ${on ? "bg-wine text-paper-light" : "bg-paper"} ${locked ? "opacity-70" : on ? "" : "hover:bg-line"}`;

type Drawn = { stem: string; branch: string; source: Source; numbers: [string, string] };

export function GuaView({
  mcp,
  people,
  initial,
  onSaved,
  onBack,
}: {
  mcp: Mcp | null;
  people: GuaPerson[];
  initial: GuaInit | null;
  onSaved: (caseId: string) => void;
  onBack?: () => void;
}) {
  const own = people.find((person) => person.group === "自己") ?? people[0];
  const [pickedId, setPersonId] = useState<string>(initial?.personId ?? own?.id ?? "");
  // 直接開在取卦分頁時，命盤名單可能還沒讀到；讀到後預設用「自己」那一張
  const personId = pickedId || own?.id || "";
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [setup, setSetup] = useState<GuaSetup>({
    mode: initial?.mode ?? "B",
    subject: initial?.subject ?? "自己",
    main: initial?.main ?? "命宮",
    aux: initial?.aux ?? [],
  });
  const [source, setSource] = useState<Source>(initial?.source ?? "隨機");
  const [inputs, setInputs] = useState<[string, string]>(initial?.numbers ?? ["", ""]);
  const [drawn, setDrawn] = useState<Drawn | null>(
    initial ? { stem: initial.stem, branch: initial.branch, source: initial.source ?? "手動", numbers: initial.numbers ?? ["", ""] } : null,
  );
  const fromCase = !!initial;
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [savedId, setSavedId] = useState<string | null>(fromCase ? "" : null);
  const [moment, setMoment] = useState<Moment | null>(() => {
    if (!initial?.at) return null;
    const value = new Date(initial.at);
    return isNaN(value.getTime()) ? null : momentOf(value);
  });

  const locked = drawn !== null;
  const person = people.find((item) => normId(item.id) === normId(personId)) ?? null;
  const chart = person ? buildChart(person) : null;
  const gua: Gua | null = drawn ? { stem: drawn.stem, branch: drawn.branch, mode: setup.mode, main: setup.main, aux: setup.aux } : null;
  const groups = [...new Set(people.map((item) => item.group))];
  const validInputs = inputs.every((value) => /^\d+$/.test(value.trim()));

  // 卦命宮所在地支：B＝抽到的地支；A＝抽到的地支是主要用宮，往回推到命宮
  const guaLifeBranch = drawn
    ? setup.mode === "B"
      ? drawn.branch
      : BRANCH_ORDER[(BRANCH_ORDER.indexOf(drawn.branch) + Math.max(0, GUA_PALACES.indexOf(setup.main))) % 12]
    : "";
  const natalLife = chart?.palaces.find((palace) => palace.name === "命宮");
  const sameHouse = !!drawn && natalLife?.earthlyBranch === guaLifeBranch;
  const isTime = drawn?.source === "時間";
  const calc = drawn?.numbers[0]
    ? `${isTime ? `${drawn.numbers[1]} 點 ${drawn.numbers[0]} 分｜分 ` : ""}${drawn.numbers[0]} ÷ 10 餘 ${BigInt(drawn.numbers[0]) % 10n} → ${drawn.stem}；${isTime ? "時 " : ""}${drawn.numbers[1]} ÷ 12 餘 ${BigInt(drawn.numbers[1]) % 12n} → ${drawn.branch}`
    : "";

  function cast() {
    const numbers: [string, string] =
      source === "隨機"
        ? [String(randomIndex(100) + 1), String(randomIndex(120) + 1)]
        : source === "時間"
          ? timeNumbers()
          : [inputs[0].trim().replace(/^0+(?=\d)/, ""), inputs[1].trim().replace(/^0+(?=\d)/, "")];
    setDrawn({ stem: stemOf(numbers[0]), branch: branchOf(numbers[1]), source, numbers });
    setMoment(momentOf(new Date()));
    setSavedId(null);
    setMessage("");
  }

  function reset() {
    setDrawn(null);
    setMoment(null);
    setSavedId(null);
    setMessage("");
  }

  function toggleAux(name: string) {
    setSetup((s) => ({ ...s, aux: s.aux.includes(name) ? s.aux.filter((x) => x !== name) : [...s.aux, name] }));
  }

  async function save() {
    if (!mcp || !gua || !drawn || !person) return;
    setBusy(true);
    setMessage("");
    try {
      const title = question.trim() || `取卦｜${setup.main}`;
      const text = guaText({ stem: drawn.stem, branch: drawn.branch, ...setup, source: drawn.source, numbers: drawn.numbers });
      const lines = [
        `- 底盤：${person.name || "未命名"}`,
        `- 起卦模式：${MODE_LABEL[setup.mode]}`,
        `- 取數方式：${drawn.source === "隨機" ? "電腦隨機" : drawn.source === "時間" ? "當下時間（分→天干、12 小時制時→地支）" : "手動輸入"}　原始數字：${drawn.numbers.join("、")}`,
        `- 換算：${calc}`,
        `- 卦：${drawn.stem}${drawn.branch}　卦命宮在${guaLifeBranch}宮${sameHouse ? "（主客同宮）" : ""}`,
        `- 卦命宮代表：${setup.subject}`,
        `- 主要用宮：${setup.main}${setup.aux.length ? `　輔助用宮：${setup.aux.join("、")}` : ""}`,
        `- 卦四化：${guaMutagenText(gua)}`,
        ...(moment ? [`- 抽卦時間：${moment.label}`] : []),
      ];
      // 完整卦盤：和下方畫面同一份資料（本命、大限、流年都以抽卦時間為準）
      const board = chart ? guaBoardText(chart, gua, moment?.date ?? null, moment?.timeIndex ?? null) : "";
      // 取卦和卦盤十二宮都寫成可收合的標題
      const content = [`## 提問\n${title}`, toggleBlock(2, "取卦", `${lines.join("\n")}${board ? `\n${board}` : ""}`), "## 第一版判斷\n", "## 討論修正\n"].join("\n");
      const result = await mcp.callTool(SERVER, "notion-create-pages", {
        parent: { data_source_id: CASE_SOURCE },
        pages: [
          {
            properties: {
              案例名稱: title,
              "date:日期:start": today(),
              "date:日期:is_datetime": 0,
              命盤: [normId(person.id)],
              卦: text,
              起卦模式: MODE_LABEL[setup.mode],
              ...(moment ? { "date:卦時間:start": moment.iso, "date:卦時間:is_datetime": 1 } : {}),
              狀態: "待驗證",
              驗證: "未知",
            },
            content,
          },
        ],
        allow_async: false,
      });
      const created = (result.payload as { pages?: { url?: string; id?: string }[] } | undefined)?.pages?.[0];
      setSavedId(created ? normId(created.url || created.id || "") : "");
      setMessage("已存成案例。");
    } catch (e) {
      setMessage(explain(e as { code?: string; message?: string }) + "　如果案例清單裡已經出現，就是有存進去了。");
    }
    setBusy(false);
  }

  if (!people.length) {
    return <p className="mx-auto max-w-md px-4 py-10 text-center text-sm text-ink-soft">命盤名單還沒讀到，先到「命盤」分頁看看。</p>;
  }

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-2 py-3 sm:px-6">
      {onBack && (
        <button type="button" onClick={onBack} className={`mx-auto w-full max-w-2xl text-left text-sm text-ink-soft underline underline-offset-4 ${FOCUS}`}>
          ← 回案例
        </button>
      )}
      <section className="mx-auto flex w-full max-w-2xl flex-col gap-3 border border-line bg-paper-light p-4">
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2">
          <label htmlFor="gua-person" className={LABEL}>
            底盤
          </label>
          <select id="gua-person" disabled={locked} value={personId} onChange={(event) => setPersonId(event.target.value)} className={`${INPUT} py-2`}>
            {groups.map((group) => (
              <optgroup key={group} label={group}>
                {people
                  .filter((item) => item.group === group)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name || "未命名"}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
          <label htmlFor="gua-question" className={LABEL}>
            問題
          </label>
          <input
            id="gua-question"
            value={question}
            disabled={locked}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="想問什麼（存案例時當名稱）"
            className={`${INPUT} py-2`}
          />
        </div>

        <fieldset disabled={locked} className="flex flex-col gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`${LABEL} mr-1`}>模式</span>
            {(["B", "A"] as Mode[]).map((mode) => (
              <button key={mode} type="button" aria-pressed={setup.mode === mode} onClick={() => setSetup({ ...setup, mode })} className={chip(setup.mode === mode, locked)}>
                {mode === "B" ? "B 地支＝卦命宮" : "A 地支＝主要用宮（對照）"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`${LABEL} mr-1`}>卦命代表</span>
            {SUBJECTS.map((name) => (
              <button key={name} type="button" aria-pressed={setup.subject === name} onClick={() => setSetup({ ...setup, subject: name })} className={chip(setup.subject === name, locked)}>
                {name}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-1">
            <span className={LABEL}>主要用宮</span>
            <div className="flex flex-wrap gap-1.5">
              {GUA_PALACES.map((name) => (
                <button
                  key={name}
                  type="button"
                  aria-pressed={setup.main === name}
                  onClick={() => setSetup({ ...setup, main: name, aux: setup.aux.filter((x) => x !== name) })}
                  className={chip(setup.main === name, locked)}
                >
                  {name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-1">
            <span className={LABEL}>輔助用宮（可多選）</span>
            <div className="flex flex-wrap gap-1.5">
              {GUA_PALACES.filter((name) => name !== setup.main).map((name) => (
                <button key={name} type="button" aria-pressed={setup.aux.includes(name)} onClick={() => toggleAux(name)} className={chip(setup.aux.includes(name), locked)}>
                  {name}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className={`${LABEL} mr-1`}>取數</span>
            {(["隨機", "手動", "時間"] as Source[]).map((name) => (
              <button key={name} type="button" aria-pressed={source === name} onClick={() => setSource(name)} className={chip(source === name, locked)}>
                {name === "隨機" ? "電腦隨機" : name === "時間" ? "當下時間" : "手動輸入"}
              </button>
            ))}
          </div>
          {source === "手動" && (
            <div className="flex items-center gap-2 text-sm">
              {[0, 1].map((i) => (
                <input
                  key={i}
                  aria-label={i === 0 ? "第一個數（天干）" : "第二個數（地支）"}
                  inputMode="numeric"
                  value={inputs[i]}
                  onChange={(event) => setInputs(i === 0 ? [event.target.value, inputs[1]] : [inputs[0], event.target.value])}
                  placeholder={i === 0 ? "數一→天干" : "數二→地支"}
                  className={`${INPUT} w-28 py-1.5`}
                />
              ))}
            </div>
          )}
        </fieldset>

        <div className="flex flex-wrap items-center gap-3">
          {!locked ? (
            <button type="button" disabled={source === "手動" && !validInputs} onClick={cast} className={`${BUTTON_PRIMARY} px-8`}>
              起卦
            </button>
          ) : (
            <button type="button" onClick={reset} className={`text-sm text-ink-soft underline underline-offset-4 ${FOCUS}`}>
              {fromCase ? "用這個底盤另起新卦" : "重新起卦"}
            </button>
          )}
          {!locked && <span className="text-xs text-ink-soft">起卦後設定就鎖住</span>}
        </div>

        {gua && drawn && (
          <div className="flex flex-col gap-1 rounded-xl bg-paper px-3 py-2.5">
            <p className="flex flex-wrap items-baseline gap-x-3">
              <span className="text-2xl font-medium tracking-[0.25em] text-wine">
                {drawn.stem}
                {drawn.branch}
              </span>
              <span className="text-sm">
                卦命宮在{guaLifeBranch}宮（{setup.subject || "未設主體"}）
              </span>
              {sameHouse && <span className="rounded-full bg-wine/10 px-2 py-0.5 text-xs text-wine">主客同宮</span>}
            </p>
            {calc && <p className="text-xs text-ink-soft">{calc}</p>}
            <p className="text-xs text-ink-soft">
              {MODE_LABEL[setup.mode]}・主要用宮 {setup.main}
              {setup.aux.length ? `・輔助 ${setup.aux.join("、")}` : ""}
            </p>
            <p className="text-xs text-ink-soft">卦四化：{guaMutagenText(gua)}（盤上帶酒紅框的祿權科忌）</p>
            {moment && <p className="text-xs text-ink-soft">抽卦時間：{moment.label}</p>}
            {!fromCase && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                {mcp && (
                  <button type="button" disabled={busy || savedId !== null} onClick={save} className={`${BUTTON_GHOST} bg-paper-light px-5 py-2`}>
                    {busy ? "存檔中…" : savedId !== null ? "已存成案例" : "存成案例"}
                  </button>
                )}
                {savedId && (
                  <button type="button" onClick={() => onSaved(savedId)} className={`text-sm underline underline-offset-4 ${FOCUS}`}>
                    到案例看 →
                  </button>
                )}
                {message && <span className="text-xs text-ink-soft">{message}</span>}
              </div>
            )}
          </div>
        )}
      </section>

      {person && chart && (
        <ChartView
          key={`${person.id}-${drawn?.stem}${drawn?.branch}-${setup.mode}${setup.main}${setup.aux.join("")}-${moment?.iso ?? ""}`}
          profile={person}
          chart={chart}
          gua={gua}
          initialDepth={2}
          initialDate={moment?.date ?? null}
          initialTime={moment?.timeIndex ?? null}
          autoScroll={false}
        />
      )}
      {person && !chart && <p className="text-sm text-danger">「{person.name}」的出生資料排不出命盤。</p>}
    </div>
  );
}
