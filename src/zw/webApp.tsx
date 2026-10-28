// 網頁版（ZW-Card）：只放排盤與抽牌——命盤、牌陣、取數、取卦。
// 程式直接沿用手機命盤頁（scripts/sync-from-phone.sh 同步），不連 Notion：
// 命盤是存在這台瀏覽器的一筆出生資料；牌陣、取卦的「存成案例」在沒有 Notion 時自動不顯示；
// 牌陣目前這盤照手機版存在瀏覽器，重開頁面還在。
import { useState } from "react";
import ChartPage, { buildChart } from "./chart";
import { DrawView } from "./draw";
import { GuaView, type GuaPerson } from "./gua";
import { SpreadView } from "./spread";
import { chartStore, useStore } from "./store";
import { BAND, FOCUS } from "./ui";

type Tab = "chart" | "spread" | "draw" | "gua";
const TABS: [Tab, string][] = [
  ["chart", "命盤"],
  ["spread", "牌陣"],
  ["draw", "取數"],
  ["gua", "取卦"],
];
const TAB_KEY = "zw-web.tab";

function readTab(): Tab {
  try {
    const saved = localStorage.getItem(TAB_KEY);
    return TABS.some(([key]) => key === saved) ? (saved as Tab) : "chart";
  } catch {
    return "chart";
  }
}

const noop = () => {};

export default function WebApp() {
  const [tab, setTabState] = useState<Tab>(readTab);
  const profile = useStore(chartStore)[0];
  // 取卦、牌陣（年運）用這台瀏覽器存的那一筆命盤
  const people: GuaPerson[] = profile && buildChart(profile) ? [{ ...profile, id: "self", group: "自己" }] : [];

  function setTab(next: Tab) {
    setTabState(next);
    try {
      localStorage.setItem(TAB_KEY, next);
    } catch {
      // 存不了就算了
    }
  }

  return (
    <div className="flex flex-1 flex-col">
      <nav className="mx-auto w-full max-w-6xl px-3 pt-1 pb-2 sm:px-6">
        <div role="tablist" aria-label="分頁" className="flex w-fit rounded-full bg-paper p-0.5">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`rounded-full px-3 py-1.5 text-sm tracking-[0.06em] whitespace-nowrap transition-colors ${FOCUS} ${
                tab === key ? "bg-ink text-paper-light" : "text-ink-soft hover:text-ink"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </nav>
      {tab === "chart" ? (
        <ChartPage />
      ) : tab === "spread" ? (
        <div className={BAND}>
          <SpreadView mcp={null} people={people} initial={null} onSaved={noop} />
        </div>
      ) : tab === "draw" ? (
        <div className={BAND}>
          <DrawView />
        </div>
      ) : people.length ? (
        <div className={BAND}>
          <GuaView mcp={null} people={people} initial={null} onSaved={noop} />
        </div>
      ) : (
        <div className={BAND}>
          <p className="mx-auto max-w-md px-4 py-10 text-center text-sm text-ink-soft">
            取卦要用你的命盤當底盤，請先到「命盤」輸入出生資料。
          </p>
        </div>
      )}
    </div>
  );
}
