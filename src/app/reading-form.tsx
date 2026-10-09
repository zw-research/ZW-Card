"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { CARD_CATEGORY, CATEGORIES, SLOTS, type SlotKey } from "./cards";
import { deleteImages, saveImage, stamp, type Reading } from "./store";
import {
  BUTTON_GHOST,
  BUTTON_PRIMARY,
  FOCUS,
  HOME_EVENT,
  INPUT,
  PANEL,
  StoredImage,
  TONES,
} from "./ui";

type Picks = Record<SlotKey, string | null>;

export function ReadingForm({
  initial,
  today,
  onSave,
  onCancel,
}: {
  initial?: Reading;
  today: string;
  onSave: (reading: Reading) => void;
  onCancel: () => void;
}) {
  const [pickedDate, setPickedDate] = useState<string | null>(initial?.date ?? null);
  const [question, setQuestion] = useState(initial?.question ?? "");
  const [picks, setPicks] = useState<Picks>({
    main: initial?.main ?? null,
    minor: initial?.minor ?? null,
    stage: initial?.stage ?? null,
  });
  const [reversed, setReversed] = useState<Record<SlotKey, boolean>>({
    main: initial?.reversed?.main ?? false,
    minor: initial?.reversed?.minor ?? false,
    stage: initial?.reversed?.stage ?? false,
  });
  const [activeSlot, setActiveSlot] = useState<SlotKey>("main");
  const [tabId, setTabId] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState(initial?.analysis ?? "");
  const [imageIds, setImageIds] = useState<string[]>(initial?.imageIds ?? []);
  const [addedIds, setAddedIds] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState("");

  const date = pickedDate ?? today;
  const slot = SLOTS.find((item) => item.key === activeSlot) ?? SLOTS[0];
  const slotCategories = CATEGORIES.filter((item) =>
    slot.categoryIds.includes(item.id),
  );
  const picked = picks[activeSlot];
  const category =
    slotCategories.find((item) => item.id === tabId) ??
    (picked ? CARD_CATEGORY.get(picked) : undefined) ??
    slotCategories[0];
  const tone = TONES[category.tone];
  const { main, minor, stage } = picks;
  const ready = Boolean(date && question.trim() && main && minor && stage);

  function chooseSlot(key: SlotKey) {
    setActiveSlot(key);
    setTabId(null);
  }

  function pick(name: string) {
    const next = { ...picks, [activeSlot]: name };
    setPicks(next);
    const nextEmpty = SLOTS.find((item) => !next[item.key]);
    if (nextEmpty) chooseSlot(nextEmpty.key);
  }

  async function addImages(files: File[]) {
    setUploading(true);
    setUploadError("");
    try {
      for (const file of files) {
        const id = await saveImage(file);
        setImageIds((ids) => [...ids, id]);
        setAddedIds((ids) => [...ids, id]);
      }
    } catch {
      setUploadError("圖片儲存失敗，請再試一次。");
    }
    setUploading(false);
  }

  function submit() {
    if (!ready || !main || !minor || !stage) return;
    // 清掉這次編輯中被移除的圖片
    const touched = [...(initial?.imageIds ?? []), ...addedIds];
    deleteImages(touched.filter((id) => !imageIds.includes(id)));
    onSave({
      ...(initial ? { id: initial.id, createdAt: initial.createdAt } : stamp()),
      date,
      question: question.trim(),
      main,
      minor,
      stage,
      reversed,
      analysis: analysis.trim(),
      imageIds,
    });
  }

  function cancel() {
    deleteImages(addedIds);
    onCancel();
  }

  // 點頁首的標題或「每日三牌」時，等同按下取消
  const cancelFromHeader = useEffectEvent(cancel);
  useEffect(() => {
    const handler = () => cancelFromHeader();
    window.addEventListener(HOME_EVENT, handler);
    return () => window.removeEventListener(HOME_EVENT, handler);
  }, []);

  return (
    <form
      className={`${PANEL} flex flex-col gap-5 p-5 sm:p-6`}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <h2 className="text-lg font-medium tracking-[0.12em]">
        {initial ? "編輯三牌紀錄" : "新增三牌紀錄"}
      </h2>

      <div className="grid gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
        <div className="flex flex-col gap-1">
          <label htmlFor="reading-date" className="text-sm tracking-widest text-ink-soft">
            日期
          </label>
          <input
            id="reading-date"
            type="date"
            required
            value={date}
            onChange={(event) => setPickedDate(event.target.value || null)}
            className={INPUT}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label
            htmlFor="reading-question"
            className="text-sm tracking-widest text-ink-soft"
          >
            問題
          </label>
          <input
            id="reading-question"
            type="text"
            required
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="今天想問的問題…"
            autoComplete="off"
            className={INPUT}
          />
        </div>
      </div>

      {/* 三張牌卡 */}
      <div className="flex flex-col gap-3">
        <span className="text-sm tracking-widest text-ink-soft">三張牌卡</span>
        <div className="grid grid-cols-3 gap-3">
          {SLOTS.map((item) => {
            const name = picks[item.key];
            const owner = name ? CARD_CATEGORY.get(name) : undefined;
            const selected = item.key === activeSlot;
            return (
              <div key={item.key} className="flex flex-col gap-2">
                <button
                  type="button"
                  aria-pressed={selected}
                  onClick={() => chooseSlot(item.key)}
                  className={`flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 transition-colors ${FOCUS} ${
                    selected
                      ? "border-ink bg-paper-light"
                      : "border-line hover:bg-paper-light"
                  }`}
                >
                  <span className="text-xs tracking-[0.12em] text-ink-soft">
                    {item.label}
                  </span>
                  <span
                    className={`text-lg font-medium tracking-[0.15em] ${
                      owner ? TONES[owner.tone].text : "font-normal text-ink-soft"
                    }`}
                  >
                    {name ?? "未選"}
                  </span>
                </button>
                <div
                  role="group"
                  aria-label={`${item.label}正倒位`}
                  className="grid grid-cols-2 overflow-hidden rounded-full border border-line"
                >
                  {[false, true].map((value) => {
                    const chosen = reversed[item.key] === value;
                    return (
                      <button
                        key={String(value)}
                        type="button"
                        aria-pressed={chosen}
                        onClick={() => setReversed({ ...reversed, [item.key]: value })}
                        className={`py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ink ${
                          chosen
                            ? value
                              ? "bg-gold-deep text-paper-light"
                              : "bg-ink text-paper-light"
                            : "text-ink-soft hover:bg-paper-light"
                        }`}
                      >
                        {value ? "倒" : "正"}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        <div className="rounded-2xl bg-paper p-5">
          {slotCategories.length > 1 && (
            <div
              role="tablist"
              aria-label={`${slot.label}分類`}
              className="mb-4 flex gap-5 border-b border-line"
            >
              {slotCategories.map((item) => {
                const selected = item.id === category.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="tab"
                    aria-selected={selected}
                    onClick={() => setTabId(item.id)}
                    className={`-mb-px border-b-2 px-1 pb-2 tracking-[0.2em] transition-colors ${FOCUS} ${
                      selected
                        ? `${TONES[item.tone].border} ${TONES[item.tone].text} font-medium`
                        : "border-transparent text-ink-soft hover:text-ink"
                    }`}
                  >
                    {item.name}
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex flex-col gap-4">
            {category.groups.map((group) => (
              <div key={group.name}>
                {category.groups.length > 1 && (
                  <h3 className="mb-2 flex items-center gap-2 text-sm tracking-[0.12em] text-ink-soft">
                    <span aria-hidden className={`h-1.5 w-1.5 rotate-45 ${tone.dot}`} />
                    {group.name}
                  </h3>
                )}
                <div className="flex flex-wrap gap-2">
                  {group.cards.map((name) => {
                    const selected = name === picked;
                    return (
                      <button
                        key={name}
                        type="button"
                        aria-pressed={selected}
                        onClick={() => pick(name)}
                        className={`rounded-full border px-4 py-2 tracking-[0.15em] transition-colors ${FOCUS} ${
                          selected ? tone.active : `border-transparent ${tone.chip}`
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
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="reading-analysis"
          className="text-sm tracking-widest text-ink-soft"
        >
          整合解析
        </label>
        <textarea
          id="reading-analysis"
          rows={6}
          value={analysis}
          onChange={(event) => setAnalysis(event.target.value)}
          placeholder="主星、輔星、長生三張牌合起來的解析…"
          className={`${INPUT} resize-y leading-7`}
        />
      </div>

      <div className="flex flex-col gap-2">
        <span className="text-sm tracking-widest text-ink-soft">圖片</span>
        <div className="flex flex-wrap items-start gap-3">
          {imageIds.map((id, index) => (
            <div key={id} className="flex flex-col items-center gap-1">
              <StoredImage id={id} alt={`附圖 ${index + 1}`} />
              <button
                type="button"
                onClick={() => setImageIds(imageIds.filter((item) => item !== id))}
                className={`text-sm text-ink-soft hover:text-danger ${FOCUS}`}
              >
                移除
              </button>
            </div>
          ))}
          <label
            className={`flex h-24 w-24 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-ink-soft text-sm text-ink-soft transition-colors hover:bg-paper-light has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-ink ${
              uploading ? "pointer-events-none opacity-50" : ""
            }`}
          >
            <span aria-hidden className="text-2xl leading-none">
              ＋
            </span>
            {uploading ? "儲存中…" : "上傳圖片"}
            <input
              type="file"
              accept="image/*"
              multiple
              disabled={uploading}
              className="sr-only"
              onChange={(event) => {
                const files = Array.from(event.target.files ?? []);
                event.target.value = "";
                if (files.length > 0) addImages(files);
              }}
            />
          </label>
        </div>
        {uploadError && (
          <p role="alert" className="text-sm text-danger">
            {uploadError}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-end gap-3 border-t border-line pt-4">
        {!ready && (
          <span className="mr-auto text-sm text-ink-soft">
            填好日期、問題並選齊三張牌卡後即可儲存。
          </span>
        )}
        <button type="button" onClick={cancel} className={BUTTON_GHOST}>
          取消
        </button>
        <button type="submit" disabled={!ready || uploading} className={BUTTON_PRIMARY}>
          儲存
        </button>
      </div>
    </form>
  );
}
