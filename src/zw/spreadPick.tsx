import { useEffect, useRef, useState } from "react";
import { CARD_CATEGORY, CATEGORIES, fixOrient, hasOrient, isReversed, orientMark } from "./cards";
import { CardZoom } from "./cardView";
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

// ── 拍照讀牌（2026/11/01）：把實體牌陣照片交給 Claude（sample capability，用本人的 Claude 用量）認牌名和正倒，
// 填進草稿；每格照樣能改，本人核對完才按「完成選牌」。實體牌照畫面上的盤擺（上排巳午未申、下排寅丑子亥，每宮主左副右，中央身宮左長生右）。
type Sample = ((input: string, opts?: Record<string, unknown>) => Promise<{ text: string }>) & {
  json: <T>(input: string, opts?: Record<string, unknown>) => Promise<T>;
  limits: () => Promise<{ images?: { maxCount: number; maxInputBytes: number; mediaTypes: string[] } }>;
};
type ReadCard = { name?: string | null; rev?: boolean; sure?: boolean };
type ReadResult = Record<string, { main?: ReadCard | null; minor?: ReadCard | null } | ReadCard | null | undefined>;
const PAIR_CHAR: Record<string, string> = {
  紫: "紫微", 府: "天府", 貪: "貪狼", 相: "天相", 殺: "七殺", 破: "破軍", 機: "天機", 陰: "太陰", 月: "太陰",
  巨: "巨門", 梁: "天梁", 日: "太陽", 陽: "太陽", 武: "武曲", 同: "天同", 廉: "廉貞",
};
const namesOf = (ids: string[]) => CATEGORIES.filter((c) => ids.includes(c.id)).flatMap((c) => c.groups.flatMap((g) => g.cards));
const pairText = (n: string) => (n.length === 2 && CARD_CATEGORY.get(n)?.id === "pair" ? `${n}（牌上寫「${PAIR_CHAR[n[0]]} × ${PAIR_CHAR[n[1]]}」）` : n);
function readPrompt(multi: boolean) {
  return [
    "這是一張紫微斗數牌卡「十二宮牌陣」的照片，請認出每個位置的牌名和正倒。",
    multi ? "第 1 張圖是整張照片；第 2～5 張是同一張照片的左上、右上、左下、右下約六成範圍的放大（有重疊），只用來看清楚小字。位置一律以第 1 張整張照片判斷。" : "",
    "擺法：26 張牌排成 4×4 的外圈加中央。照片上方就是盤的上方。",
    "外圈 12 個位置用地支表示：上排由左到右＝巳、午、未、申；左欄由上到下＝巳、辰、卯、寅；右欄由上到下＝申、酉、戌、亥；下排由左到右＝寅、丑、子、亥（四個角各算一次）。",
    "每個位置並排兩張：左邊是主星牌（main），右邊是輔星牌（minor）。中央兩張：左邊是身宮（body，主星牌），右邊是長生牌（stage）。",
    "每張牌上下兩端都印有牌名。正位＝牌名文字正著讀；倒位＝整張牌上下顛倒（文字倒著）。空宮牌只有外框，不分正倒，rev 寫 false。",
    `主星牌只會是：${namesOf(["main", "pair"]).map(pairText).join("、")}。`,
    `輔星牌只會是：${namesOf(["minor"]).join("、")}。`,
    `長生牌只會是：${namesOf(["stage"]).join("、")}。`,
    "同一陣裡同一張牌不會出現兩次。牌名一律用上面清單裡的寫法（雙星用兩個字的簡稱）。",
    "看不清楚或不確定的：name 寫你最可能的答案並把 sure 寫 false；完全看不出來就 name 寫 null。不要硬猜成 sure:true。",
    '只回一個 JSON 物件，鍵是 12 個地支加 body、stage：{"巳":{"main":{"name":"紫微","rev":false,"sure":true},"minor":{"name":"化權","rev":true,"sure":true}}, …, "body":{"name":"七殺","rev":false,"sure":true},"stage":{"name":"長生","rev":false,"sure":true}}',
  ]
    .filter(Boolean)
    .join("\n");
}
// 照片縮成長邊 2400px 的 JPEG；再切四個角落放大圖（看清楚牌上的小字）
async function photoParts(file: File, multi: boolean): Promise<Blob[]> {
  const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
  const cut = async (sx: number, sy: number, sw: number, sh: number, max: number) => {
    const k = Math.min(1, max / Math.max(sw, sh));
    const c = document.createElement("canvas");
    c.width = Math.round(sw * k);
    c.height = Math.round(sh * k);
    c.getContext("2d")!.drawImage(bmp, sx, sy, sw, sh, 0, 0, c.width, c.height);
    return new Promise<Blob>((ok, bad) => c.toBlob((b) => (b ? ok(b) : bad(new Error("toBlob"))), "image/jpeg", 0.88));
  };
  const W = bmp.width, H = bmp.height;
  const parts = [await cut(0, 0, W, H, 2400)];
  if (multi) {
    const w = W * 0.58, h = H * 0.58;
    for (const [x, y] of [[0, 0], [W - w, 0], [0, H - h], [W - w, H - h]]) parts.push(await cut(x, y, w, h, 1800));
  }
  bmp.close();
  return parts;
}
// 讀回的結果填進草稿：牌名不在清單、和前面重複、或標不確定的，都標起來要本人核對
function applyRead(d: Draft, r: ReadResult) {
  const allowed: Record<Kind, Set<string>> = { main: new Set(namesOf(["main", "pair"])), minor: new Set(namesOf(["minor"])), stage: new Set(namesOf(["stage"])) };
  const used = new Set<string>();
  const doubt = new Set<Key>();
  let next = d;
  let got = 0;
  const take = (key: Key, kind: Kind, rc: ReadCard | null | undefined) => {
    const name = String(rc?.name ?? "").replace(/\s/g, "");
    if (!name || !allowed[kind].has(name) || (kind !== "stage" && used.has(name))) {
      doubt.add(key);
      return;
    }
    if (kind !== "stage") used.add(name);
    next = setCard(next, key, fixOrient({ name, reversed: !!rc?.rev }));
    got++;
    if (rc?.sure === false) doubt.add(key);
  };
  d.cells.forEach((c, i) => {
    const at = (r[c.branch] ?? {}) as { main?: ReadCard | null; minor?: ReadCard | null };
    take(`c${i}m`, "main", at.main);
    take(`c${i}n`, "minor", at.minor);
  });
  take("body", "main", r.body as ReadCard);
  take("stage", "stage", r.stage as ReadCard);
  return { next, got, doubt };
}
const READ_ERR: Record<string, string> = {
  not_granted: "沒有允許這頁使用 Claude，到頁面上方的權限選單打開後再試",
  rate_limited: "Claude 用量暫時用完或太頻繁，等一下再試",
  image_rejected: "這張照片讀不進去，換一張（JPEG／PNG）再試",
  invalid_json: "Claude 回的格式不對，再按一次試試",
  session_expired: "登入過期了，重新登入 claude.ai 再試",
};

export function SpreadPicker({ draft, onChange, onDone, title }: { draft: Draft; onChange: (d: Draft) => void; onDone: () => void; title: string }) {
  const [active, setActive] = useState<Key | null>(() => ORDER.find((o) => !getCard(draft, o.key))?.key ?? null);
  const [tabId, setTabId] = useState<string | null>(null);
  const [zoom, setZoom] = useState<Card | null>(null);
  const count = pickedCount(draft);
  // 拍照讀牌：這個畫面能送圖片給 Claude 才顯示（網頁版沒有）
  const [reader, setReader] = useState<{ sample: Sample; multi: boolean } | null>(null);
  const [reading, setReading] = useState<AbortController | null>(null);
  const [readMsg, setReadMsg] = useState("");
  const [doubt, setDoubt] = useState<Set<Key>>(new Set());
  const [confirmPhoto, setConfirmPhoto] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const claude = (window as unknown as { claude?: { use: (n: string) => Promise<unknown> } }).claude;
    if (!claude) return;
    let live = true;
    claude
      .use("sample")
      .then(async (s) => {
        const sample = s as Sample | null;
        const lim = sample ? await sample.limits().catch(() => null) : null;
        if (live && sample && lim?.images) setReader({ sample, multi: lim.images.maxCount >= 5 });
      })
      .catch(() => null);
    return () => {
      live = false;
    };
  }, []);
  const dropDoubt = (key: Key) => doubt.has(key) && setDoubt((s) => new Set([...s].filter((k) => k !== key)));
  async function readPhoto(file: File) {
    if (!reader || reading) return;
    const ctl = new AbortController();
    setReading(ctl);
    setReadMsg("");
    try {
      const images = await photoParts(file, reader.multi);
      const r = await reader.sample.json<ReadResult>(readPrompt(reader.multi), { images, signal: ctl.signal, cache: false });
      const { next, got, doubt: d } = applyRead(draft, r && typeof r === "object" ? r : {});
      onChange(next);
      setDoubt(d);
      setActive(null);
      setReadMsg(`讀到 ${got} 張${d.size ? `，${d.size} 格要你核對（金框）` : ""}；每一格都請對照實體牌，倒牌特別注意。`);
    } catch (e) {
      const code = (e as { code?: string })?.code ?? "";
      if (code !== "cancelled") setReadMsg(`沒讀成功：${READ_ERR[code] ?? "照片處理或連線失敗，再試一次，或改用手選"}`);
    }
    setReading(null);
  }

  function choose(key: Key) {
    setActive(key);
    setTabId(null);
  }
  function pick(name: string) {
    if (!active) return;
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
        {reader && (
          <span className="ml-auto flex items-center gap-2">
            {reading ? (
              <>
                <span className="text-xs text-ink-soft">讀牌中…約半分鐘到一分鐘</span>
                <button type="button" onClick={() => reading.abort()} className={`text-xs underline underline-offset-4 ${FOCUS}`}>
                  停止
                </button>
              </>
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
                if (f) readPhoto(f);
              }}
            />
          </span>
        )}
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
