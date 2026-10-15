import { useSyncExternalStore } from "react";

// ---------- 以 localStorage 保存文字資料 ----------
type Store<T> = {
  subscribe: (listener: () => void) => () => void;
  getSnapshot: () => T[];
  getServerSnapshot: () => T[];
  save: (items: T[]) => void;
};

function createStore<T>(
  key: string,
  isValid: (item: Record<string, unknown>) => boolean,
): Store<T> {
  const listeners = new Set<() => void>();
  const empty: T[] = [];
  let fallback = "[]";
  let cachedRaw = "";
  let cached: T[] = empty;

  function pickValid(data: unknown): T[] {
    if (!Array.isArray(data)) return [];
    return data.filter(
      (item): item is T => typeof item === "object" && item !== null && isValid(item),
    );
  }

  function parse(raw: string): T[] {
    try {
      return pickValid(JSON.parse(raw));
    } catch {
      return [];
    }
  }

  return {
    subscribe(listener) {
      listeners.add(listener);
      window.addEventListener("storage", listener);
      return () => {
        listeners.delete(listener);
        window.removeEventListener("storage", listener);
      };
    },
    getSnapshot() {
      let raw = fallback;
      try {
        raw = localStorage.getItem(key) ?? fallback;
      } catch {
        // localStorage 無法使用時，僅保留在這次開啟的頁面中
      }
      if (raw !== cachedRaw) {
        cachedRaw = raw;
        cached = parse(raw);
      }
      return cached;
    },
    getServerSnapshot: () => empty,
    save(items) {
      fallback = JSON.stringify(items);
      try {
        localStorage.setItem(key, fallback);
      } catch {
        // 同上
      }
      listeners.forEach((listener) => listener());
    },
  };
}

// 個人命盤的出生資料；只存一筆
export type ChartProfile = {
  name: string;
  calendar: "solar" | "lunar";
  year: number;
  month: number;
  day: number;
  isLeapMonth: boolean;
  timeIndex: number;
  gender: "男" | "女";
};

export const chartStore = createStore<ChartProfile>(
  "practice1.chart",
  (item) =>
    typeof item.name === "string" &&
    (item.calendar === "solar" || item.calendar === "lunar") &&
    typeof item.year === "number" &&
    typeof item.month === "number" &&
    typeof item.day === "number" &&
    typeof item.isLeapMonth === "boolean" &&
    typeof item.timeIndex === "number" &&
    (item.gender === "男" || item.gender === "女"),
);

export function useStore<T>(store: Store<T>) {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
}

// ---------- 日期 ----------
const subscribeNever = () => () => {};

function getToday() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function useToday() {
  return useSyncExternalStore(subscribeNever, getToday, () => "");
}
