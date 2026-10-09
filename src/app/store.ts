import { useSyncExternalStore } from "react";
import type { SlotKey } from "./cards";

// 單星的補充事項
export type Note = {
  id: string;
  date: string;
  card: string;
  text: string;
  createdAt: number;
};

// 每日三牌：主星＋輔星＋長生的整合解析
export type Reading = {
  id: string;
  date: string;
  question: string;
  main: string;
  minor: string;
  stage: string;
  // 各張牌是否為倒位；舊紀錄沒有這個欄位，一律視為正位
  reversed?: Partial<Record<SlotKey, boolean>>;
  analysis: string;
  imageIds: string[];
  createdAt: number;
};

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

  function parse(raw: string): T[] {
    try {
      const data: unknown = JSON.parse(raw);
      if (!Array.isArray(data)) return [];
      return data.filter(
        (item): item is T =>
          typeof item === "object" && item !== null && isValid(item),
      );
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

export const noteStore = createStore<Note>(
  "practice1.daily-cards",
  (item) =>
    typeof item.id === "string" &&
    typeof item.date === "string" &&
    typeof item.card === "string" &&
    typeof item.text === "string" &&
    typeof item.createdAt === "number",
);

export const readingStore = createStore<Reading>(
  "practice1.readings",
  (item) =>
    typeof item.id === "string" &&
    typeof item.date === "string" &&
    typeof item.question === "string" &&
    typeof item.main === "string" &&
    typeof item.minor === "string" &&
    typeof item.stage === "string" &&
    typeof item.analysis === "string" &&
    Array.isArray(item.imageIds) &&
    typeof item.createdAt === "number",
);

export function useStore<T>(store: Store<T>) {
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getServerSnapshot,
  );
}

export function stamp() {
  const createdAt = Date.now();
  return { id: `${createdAt}-${Math.random().toString(36).slice(2)}`, createdAt };
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

export function formatDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  if (!year || !month || !day) return date;
  return `${year}年${month}月${day}日`;
}

// ---------- 以 IndexedDB 保存圖片 ----------
const DB_NAME = "practice1";
const IMAGE_STORE = "images";
const MAX_SIDE = 1600;

function openDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(IMAGE_STORE);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withImages<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T> | void,
) {
  const db = await openDb();
  return new Promise<T | undefined>((resolve, reject) => {
    const transaction = db.transaction(IMAGE_STORE, mode);
    const request = action(transaction.objectStore(IMAGE_STORE));
    transaction.oncomplete = () => {
      db.close();
      resolve(request ? request.result : undefined);
    };
    transaction.onerror = transaction.onabort = () => {
      db.close();
      reject(transaction.error);
    };
  });
}

// 長邊縮到 MAX_SIDE 以內再存，避免原圖過大
async function shrinkImage(file: File): Promise<Blob> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size < 1024 * 1024) {
      bitmap.close();
      return file;
    }
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const context = canvas.getContext("2d");
    if (!context) return file;
    context.fillStyle = "#fff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85),
    );
    return blob ?? file;
  } catch {
    return file;
  }
}

export async function saveImage(file: File) {
  const blob = await shrinkImage(file);
  const { id } = stamp();
  await withImages("readwrite", (store) => {
    store.put(blob, id);
  });
  return id;
}

export function loadImage(id: string) {
  return withImages<Blob>("readonly", (store) => store.get(id));
}

export async function deleteImages(ids: string[]) {
  if (ids.length === 0) return;
  try {
    await withImages("readwrite", (store) => {
      ids.forEach((id) => store.delete(id));
    });
  } catch {
    // 刪不掉只會留下用不到的圖片，不影響使用
  }
}
