#!/usr/bin/env bash
# 從手機命盤頁（zw-research/phone-pages 的 zwchart/src）同步「排盤＋抽牌」相關程式到網頁版。
# 網頁版只放：命盤、牌陣、取數、取卦（不連 Notion）。案例、日運、命盤名單不同步。
# 用法：bash scripts/sync-from-phone.sh <phone-pages 資料夾>
set -euo pipefail
PHONE="${1:?請給 phone-pages 資料夾路徑}"
SRC="$PHONE/zwchart/src"
DEST="$(cd "$(dirname "$0")/.." && pwd)/src/zw"
FILES=(chart.tsx cards.ts cardImages.ts cardView.tsx spread.tsx smallSpread.tsx spreadPick.tsx draw.tsx gua.tsx cases.tsx stars.ts store.ts ui.tsx)
mkdir -p "$DEST/shims"
for f in "${FILES[@]}"; do cp "$SRC/$f" "$DEST/$f"; done
cp "$SRC/shims/link.tsx" "$DEST/shims/link.tsx"
# 網頁版沒有牌卡頁，星名只顯示文字：next/link 換成同一個 shim（和手機版一樣）
sed -i 's#from "next/link";#from "./shims/link";#' "$DEST"/*.tsx
# 牌卡圖
mkdir -p "$DEST/../../public"
rm -rf "$DEST/../../public/cards" && cp -r "$PHONE/zwchart/cards" "$DEST/../../public/cards"
echo "已同步：${FILES[*]}＋牌卡圖"
