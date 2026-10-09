"use client";

import { useState } from "react";
import { CARD_CATEGORY, SLOTS } from "../cards";
import {
  chartStore,
  exportImages,
  importImages,
  noteStore,
  readingStore,
  useStore,
  type Note,
  type Reading,
} from "../store";
import {
  BAND,
  BAND_INNER,
  BUTTON_GHOST,
  BUTTON_PRIMARY,
  PANEL,
  PageHeading,
} from "../ui";

// ---------- CSV：Notion 可以直接匯入成資料庫 ----------
function toCsv(rows: string[][]) {
  return rows
    .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(","))
    .join("\r\n");
}

function readingsCsv(readings: Reading[]) {
  const header = ["問題", "日期", ...SLOTS.flatMap((slot) => [slot.label, `${slot.label}正倒`]), "整合解析", "圖片數"];
  const rows = [...readings]
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    .map((reading) => [
      reading.question,
      reading.date,
      ...SLOTS.flatMap((slot) => [
        reading[slot.key],
        reading.reversed?.[slot.key] ? "倒" : "正",
      ]),
      reading.analysis,
      String(reading.imageIds.length),
    ]);
  return toCsv([header, ...rows]);
}

function notesCsv(notes: Note[]) {
  const header = ["牌卡", "分類", "日期", "補充事項"];
  const rows = [...notes]
    .sort((a, b) => a.card.localeCompare(b.card, "zh-Hant") || a.createdAt - b.createdAt)
    .map((note) => [note.card, CARD_CATEGORY.get(note.card)?.name ?? "", note.date, note.text]);
  return toCsv([header, ...rows]);
}

// ---------- 下載與檔名 ----------
function download(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function todayStamp() {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

// 以 id 合併：備份檔裡有的覆蓋現有的，其餘保留
function mergeById<T extends { id: string }>(current: T[], incoming: T[]) {
  const merged = new Map(current.map((item) => [item.id, item]));
  for (const item of incoming) merged.set(item.id, item);
  return [...merged.values()];
}

export default function BackupPage() {
  const readings = useStore(readingStore);
  const notes = useStore(noteStore);
  const chart = useStore(chartStore);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const imageCount = readings.reduce((total, reading) => total + reading.imageIds.length, 0);

  async function downloadBackup() {
    setBusy(true);
    setMessage("");
    try {
      const images = await exportImages(readings.flatMap((reading) => reading.imageIds));
      download(
        `每日牌卡備份-${todayStamp()}.json`,
        JSON.stringify({ version: 1, readings, notes, chart, images }),
        "application/json",
      );
      setMessage("備份檔已下載。");
    } catch {
      setMessage("備份失敗，請再試一次。");
    }
    setBusy(false);
  }

  async function restoreBackup(file: File) {
    setBusy(true);
    setMessage("");
    try {
      const data: unknown = JSON.parse(await file.text());
      if (typeof data !== "object" || data === null) throw new Error("not a backup");
      const backup = data as Record<string, unknown>;
      const backupReadings = readingStore.pickValid(backup.readings);
      const backupNotes = noteStore.pickValid(backup.notes);
      const backupChart = chartStore.pickValid(backup.chart);
      if (backupReadings.length + backupNotes.length + backupChart.length === 0) {
        throw new Error("empty backup");
      }

      const restoredImages =
        typeof backup.images === "object" && backup.images !== null
          ? await importImages(backup.images as Record<string, string>)
          : 0;
      readingStore.save(mergeById(readings, backupReadings));
      noteStore.save(mergeById(notes, backupNotes));
      if (backupChart.length > 0) chartStore.save(backupChart);

      setMessage(
        `已還原 ${backupReadings.length} 筆三牌紀錄、${backupNotes.length} 則補充事項、${restoredImages} 張圖片` +
          (backupChart.length > 0 ? "，以及命盤的出生資料。" : "。"),
      );
    } catch {
      setMessage("這個檔案不是可用的備份檔，沒有還原任何資料。");
    }
    setBusy(false);
  }

  return (
    <main className="flex flex-1 flex-col">
      <PageHeading compact en="Backup" zh="資料備份" note="把紀錄存成檔案，或匯入 Notion" />

      <div className={BAND}>
        <div className={BAND_INNER}>
          <p className="text-sm text-ink-soft">
            這個瀏覽器裡目前有 {readings.length} 筆三牌紀錄、{notes.length} 則補充事項、
            {imageCount} 張圖片{chart.length > 0 ? "，以及命盤的出生資料" : ""}。
          </p>

          <div className="grid items-start gap-6 lg:grid-cols-2">
            <section className={`${PANEL} flex flex-col gap-4 p-5 sm:p-6`}>
              <h2 className="text-lg font-medium tracking-[0.12em]">匯出到 Notion</h2>
              <p className="text-sm leading-6 text-ink-soft">
                下載成 CSV 表格檔，Notion 匯入後會變成一個資料庫，每筆紀錄一列。圖片不包含在內。
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={readings.length === 0}
                  onClick={() =>
                    download(`三牌紀錄-${todayStamp()}.csv`, readingsCsv(readings), "text/csv")
                  }
                  className={BUTTON_PRIMARY}
                >
                  三牌紀錄
                </button>
                <button
                  type="button"
                  disabled={notes.length === 0}
                  onClick={() =>
                    download(`單星補充-${todayStamp()}.csv`, notesCsv(notes), "text/csv")
                  }
                  className={BUTTON_PRIMARY}
                >
                  單星補充
                </button>
              </div>
              <ol className="list-decimal space-y-1 pl-5 text-sm leading-6 text-ink-soft">
                <li>在 Notion 左側選單按「匯入」（Import）。</li>
                <li>選「CSV」，再選剛下載的檔案。</li>
                <li>匯入後會多一個資料庫頁面，可以改名、移到想放的地方。</li>
              </ol>
            </section>

            <section className={`${PANEL} flex flex-col gap-4 p-5 sm:p-6`}>
              <h2 className="text-lg font-medium tracking-[0.12em]">完整備份</h2>
              <p className="text-sm leading-6 text-ink-soft">
                把所有紀錄、補充事項、圖片和出生資料存成一個檔案。換瀏覽器、換裝置或清除瀏覽資料之後，可以用它還原。
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={busy}
                  onClick={downloadBackup}
                  className={BUTTON_PRIMARY}
                >
                  下載備份檔
                </button>
                <label
                  className={`${BUTTON_GHOST} cursor-pointer has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink ${
                    busy ? "pointer-events-none opacity-40" : ""
                  }`}
                >
                  從備份檔還原
                  <input
                    type="file"
                    accept="application/json,.json"
                    disabled={busy}
                    className="sr-only"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      event.target.value = "";
                      if (file) restoreBackup(file);
                    }}
                  />
                </label>
              </div>
              <p className="text-sm leading-6 text-ink-soft">
                還原時不會刪除現有的資料：備份檔裡有的會加回來或覆蓋同一筆，其餘保留。
              </p>
              {message && (
                <p role="status" className="text-sm font-medium">
                  {message}
                </p>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
