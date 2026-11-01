// 拍照讀牌（2026/11/01 改版）：不靠 Claude，直接在手機上用牌卡圖比對。
// 1. 找牌：照片縮到寬 900，黑色桌布上「比較亮的區塊」就是牌（門檻＝亮度第 40 和第 95 百分位之間的 18% 處），
//    先 7×7 開運算去掉桌布細線、星星，再補洞、找連通區塊，留下長寬比像牌的；要剛好 26 張。
// 2. 對位置：最上排 8 張、最下排 8 張（兩兩一宮，左主右副）、左右兩欄各 4 張、中間 2 張（左身宮右長生）；
//    擺法照畫面上的盤（上排巳午未申、左欄巳辰卯寅、右欄申酉戌亥、下排寅丑子亥），2026/11/01 皐月確認。
// 3. 比對：每張牌只取中間（左右各去 14%、上下各去 10%，避開白邊）縮成 20×36，三個顏色各自標準化（抵掉光線、白平衡），
//    和 70 張牌卡小圖（cards/t/）正擺、倒擺都比，取平均差最小的；容許位置差 3%（九個位置取最好）。
//    主星位只比主星／雙星／空宮、輔星位只比輔星、長生位只比長生；主星和輔星各自用指派法（同一張不重複）。
// 3b. 轉正（2026/11/01 第二張照片加的）：每張牌用像素分布算出傾斜角度和真正的長寬，轉正後再取中間比對（斜拍的照片 23→25 張）。
// 4. 空宮：牌卡圖是全黑、實體牌是深灰布紋，另外放一張皐月實拍的空宮（BLANK_REF）一起比。
// 用皐月 2026/11/01 的兩張實拍測：第一張 26／26；第二張（斜、反光）25／26，錯的那張被標成沒把握；第一張改成歪 3°／5°、變暗、偏黃、低解析、斜拍也都全對。
import { CARD_IMAGE_ID } from "./cardImages";

export type Pick = { name: string; reversed: boolean; doubt: boolean };
export type PhotoResult = { cells: Record<string, { main: Pick; minor: Pick }>; body: Pick; stage: Pick };
export class PhotoError extends Error {}

const GW = 20, GH = 36, MX = 0.14, MY = 0.1, SHIFT = 0.03;
const BLANK_REF = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABQAAAAkCAIAAAAGkY33AAABUWlDQ1BJQ0MgUHJvZmlsZQAAeJx9kL9LAmEcxj+nhWA2RA0NDTdFwxWiQS0NahBFw2EFatN5/gS1l7uLENr6B4T+gwqa25IGGxsagqgpamtqKmgpeePuDI2oZ3k/PO/Dw5cHApOGELUhoN5wrPRKUs1kc2roGQUFT4Zpi4Sur7v8/f7U+72fvZ11u37//6twoWibwCcQNYXlgKIB+p4jXN4HJqxMNgdKy+Wyzycu530+9zKb6RQo14BqVowCKC+Alh/wywNcr+2avRvc6yPFxtaG2wNMsUwVG0ENgyYqOvE/8vNePsUOgiYWVcpUcFBJILyGIiqrNDCZQ0MlRpQYMXfn3n53vf20vnfwBEsdKeVF31vrwNkChNt9b2YRxkbgqi0My/CsIBAoleD1FEazMH4D4W27FI/510eSMPwo5ds0hA6h25Ly40jK7jEEH+Cy8QUDp2ITOrol5gAABCpJREFUeF5NVV1vXEUM9bFnP25AbSFtE1B4QkGVqv7MvvPb+gIooikkD0CIaJNslN07ttHxbKpeKXtzZzz+OD4+g7dvf77659/tbjYYEMsVTn/68c2b18dHL9Xs46ebs7Ozd+9+2Wx2ZgskAFHTb549PT39oV1cXIgYYAJAF+7y268fzn+/nNZLqD7MfZ7dPVNMEpmSIuFxfX39/PDr1ns2S6hEbWZAre122M47kWQkiNCxiFRcSCR65M3dbcuMFGSdpQ00MviCpvAA/8oCxm8RBVex282qSIaMYNiUiGFdHymMF8J4FZquMkAH6PPcmAeNIPwBtAzKQ4NWnuAKIjKH0fAhgpbc4jptKh5YgFb4CBc1E0GmRUWG0kBBZy2d0eixXFbMCsZquDIKGYdUgZGWwHswwmcwByBVeZQvqTL2mO3fhUVEPmwfGnGmN26xj3WcNbAA/o7ow0kwmUQiEtvt3CId6SrcLA9fJJKMz1KJOWPwB8pYyD57o4GNWsEOp5gZiEcoO4pKTGyPC8ENiYJEmqR4d2FbFElieDi9CKr3kuS8JIMol9MLCgi0de/K6kbixJOUk2ox0a50+E6IQy0zjc1jfa2IoRFZRuw6CaRaxxlzUIb7GYhUQXAroSjAvBoGmDJPLXpz0orkZHP1l83LEGiVgMxoXx0c3N3eKwyqCUuPwICKlB74t2aqWr3jCkNFrtbr9t3xy7/y6vbuHoSn18wpBzj6mKuI7q6tLVjfqKMjUr4/fNamaT1N06ebTblmgUa20xX5ALh3EYs0Tm0SjRAHsNnctZuPt9fX/wVj1eRD9kmLpNMoSKv0oJq0miGroq6urtvFxZ+b+x1E26Ile1v0LFkYrUqh5/HZI81UCBmJ2ihS82zWpAu0SEqCcKzMbI+8iG9juVySDwlnRmRJa62J7AoY1jRmh41k8yOEmaiyeb13MyvGCOOLNA8nT+sZlObhgDUyeDgKqsiYDnZ+DL2q6osXzz3d3RmnHnefex8d5sOT/L9svHsfNr339uTpE+rykLjqctGWRyLclMSvHJLCETrIWCIjbbVcRnjUiBEwHmfJMfpUpKRXVTLDhjrSLwFbrdaS6d5VjepSlYvqgGeo7RBV50yqsTHDGdpi0faV7adgf00kPZI5QxAjQcwLTqJdTG/raUUVmIPStJ8hK3gflYyAs6uVw15fOR7Qtl6vlIgQ1Rpt0odcqJjuzpVwMr1E41FhMxF6MB2Qz4/5jIZ//vzilhGnOlUXnITxiHYwTWqc7P1cFAfYIKoBiTCurnE/UimqkaAYZJuYNmVoyPWw3vPs8VotGRjXmYvUWJZHXU/r5WJRyvL4FGEq+ZnyoElqw+umKPKnkA+RBOzo6Pjy8m9eRgNtgcMXCzs5OXn16vTw8Nvtdnt+/sf79x/uNw+ZjQJdt9//ysJLi0NQN18AAAAASUVORK5CYII=";

type Feat = Float32Array;
function featFrom(data: Uint8ClampedArray): Feat {
  const n = GW * GH, f = new Float32Array(n * 3);
  for (let c = 0; c < 3; c++) {
    let s = 0, s2 = 0;
    for (let i = 0; i < n; i++) { const x = data[i * 4 + c]; s += x; s2 += x * x; }
    const m = s / n, sd = Math.sqrt(Math.max(s2 / n - m * m, 0)) + 1e-6;
    for (let i = 0; i < n; i++) f[i * 3 + c] = (data[i * 4 + c] - m) / sd;
  }
  return f;
}
const small = document.createElement("canvas");
small.width = GW;
small.height = GH;
const sctx = small.getContext("2d", { willReadFrequently: true })!;
sctx.imageSmoothingQuality = "high";
function featOf(src: CanvasImageSource, sx: number, sy: number, sw: number, sh: number): Feat {
  sctx.clearRect(0, 0, GW, GH);
  sctx.drawImage(src, sx, sy, sw, sh, 0, 0, GW, GH);
  return featFrom(sctx.getImageData(0, 0, GW, GH).data);
}
// 倒擺：整張轉 180 度＝像素順序反過來
function flipped(f: Feat): Feat {
  const n = GW * GH, g = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) g[(n - 1 - i) * 3 + c] = f[i * 3 + c];
  return g;
}
function dist(a: Feat, b: Feat) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += Math.abs(a[i] - b[i]);
  return s / a.length;
}
const loadImg = (src: string) =>
  new Promise<HTMLImageElement>((ok, bad) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => bad(new PhotoError("牌卡圖載入不了，重新整理頁面再試"));
    im.src = src;
  });
let refCache: Promise<Map<string, { up: Feat; down: Feat }[]>> | null = null;
function refs() {
  refCache ??= (async () => {
    const map = new Map<string, { up: Feat; down: Feat }[]>();
    await Promise.all(
      Object.entries(CARD_IMAGE_ID).map(async ([name, id]) => {
        const im = await loadImg(`cards/t/${id}.jpg`);
        const w = im.naturalWidth, h = im.naturalHeight;
        const up = featOf(im, w * MX, h * MY, w * (1 - 2 * MX), h * (1 - 2 * MY));
        map.set(name, [{ up, down: flipped(up) }]);
      }),
    );
    const blank = await loadImg(BLANK_REF);
    const bf = featOf(blank, 0, 0, blank.naturalWidth, blank.naturalHeight);
    map.get("空宮")?.push({ up: bf, down: bf });
    return map;
  })();
  refCache.catch(() => (refCache = null));
  return refCache;
}

// 牌：中心、傾斜角（相對直立，弧度）、沿牌身的寬高（都是寬 900 的座標）
type Box = { cx: number; cy: number; th: number; w: number; h: number };
// 二值圖：最小／最大濾波（方框 k×k），用來做開運算
function morph(m: Uint8Array, W: number, H: number, k: number, erode: boolean) {
  const r = k >> 1, tmp = new Uint8Array(W * H), out = new Uint8Array(W * H);
  const pass = (src: Uint8Array, dst: Uint8Array, horiz: boolean) => {
    const L = horiz ? W : H, N = horiz ? H : W;
    for (let j = 0; j < N; j++) {
      let cnt = 0;
      const at = (i: number) => (horiz ? j * W + i : i * W + j);
      for (let i = -r; i <= r; i++) if (i >= 0 && i < L) cnt += src[at(i)];
      for (let i = 0; i < L; i++) {
        const span = Math.min(L - 1, i + r) - Math.max(0, i - r) + 1;
        dst[at(i)] = erode ? (cnt === span ? 1 : 0) : cnt > 0 ? 1 : 0;
        const out0 = i - r, in1 = i + r + 1;
        if (out0 >= 0) cnt -= src[at(out0)];
        if (in1 < L) cnt += src[at(in1)];
      }
    }
  };
  pass(m, tmp, true);
  pass(tmp, out, false);
  return out;
}
function findCards(bmp: ImageBitmap): { boxes: Box[]; k: number } {
  const W = 900, k = bmp.width / W, H = Math.round(bmp.height / k);
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(bmp, 0, 0, W, H);
  const px = ctx.getImageData(0, 0, W, H).data;
  const v = new Uint8Array(W * H), hist = new Array(256).fill(0);
  for (let i = 0; i < W * H; i++) {
    const m = Math.max(px[i * 4], px[i * 4 + 1], px[i * 4 + 2]);
    v[i] = m;
    hist[m]++;
  }
  const pct = (p: number) => {
    let acc = 0;
    for (let i = 0; i < 256; i++) if ((acc += hist[i]) >= (p / 100) * W * H) return i;
    return 255;
  };
  const p40 = pct(40), p95 = pct(95), T = p40 + 0.18 * (p95 - p40);
  let m = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) m[i] = v[i] > T ? 1 : 0;
  m = morph(morph(m, W, H, 7, true), W, H, 7, false);
  // 補洞：從邊框往內灌，灌不到的暗處就是牌裡面
  const outside = new Uint8Array(W * H), stack: number[] = [];
  const seed = (i: number) => { if (!m[i] && !outside[i]) { outside[i] = 1; stack.push(i); } };
  for (let x = 0; x < W; x++) { seed(x); seed((H - 1) * W + x); }
  for (let y = 0; y < H; y++) { seed(y * W); seed(y * W + W - 1); }
  while (stack.length) {
    const i = stack.pop()!, x = i % W;
    if (x > 0) seed(i - 1);
    if (x < W - 1) seed(i + 1);
    if (i >= W) seed(i - W);
    if (i < W * (H - 1)) seed(i + W);
  }
  const lab = new Int32Array(W * H), boxes: Box[] = [];
  let next = 0;
  for (let s = 0; s < W * H; s++) {
    if (outside[s] || lab[s]) continue;
    next++;
    let x0 = W, y0 = H, x1 = 0, y1 = 0, n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
    stack.push(s);
    lab[s] = next;
    while (stack.length) {
      const i = stack.pop()!, x = i % W, y = (i / W) | 0;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      n++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y;
      for (const j of [x > 0 ? i - 1 : -1, x < W - 1 ? i + 1 : -1, i - W, i + W]) {
        if (j >= 0 && j < W * H && !outside[j] && !lab[j]) { lab[j] = next; stack.push(j); }
      }
    }
    const bw = x1 - x0 + 1, bh = y1 - y0 + 1;
    if (!(bh > 70 && bw > 40 && bh / bw > 1.3 && bh / bw < 2.2)) continue;
    // 傾斜角：二階動差的長軸方向，減 90° 變成相對直立的偏角
    const mx = sx / n, my = sy / n, cxx = sxx / n - mx * mx, cyy = syy / n - my * my, cxy = sxy / n - mx * my;
    let th = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
    if (th < 0) th += Math.PI;
    th -= Math.PI / 2;
    const c = Math.cos(th), sn = Math.sin(th);
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity;
    for (let y = y0; y <= y1; y++)
      for (let x = x0; x <= x1; x++) {
        if (lab[y * W + x] !== next) continue;
        const u = (x - mx) * c + (y - my) * sn, v = -(x - mx) * sn + (y - my) * c;
        if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v;
      }
    // 中心改用沿牌身的範圍中點（形狀不對稱時比平均位置準）
    const um = (u0 + u1) / 2, vm = (v0 + v1) / 2;
    boxes.push({ cx: mx + um * c - vm * sn, cy: my + um * sn + vm * c, th, w: u1 - u0 + 1, h: v1 - v0 + 1 });
  }
  return { boxes, k };
}

// 指派法（Hungarian）：rows ≤ cols，回傳每列選到的欄
function assign(cost: number[][]): number[] {
  const n = cost.length, m = cost[0].length, INF = 1e18;
  const u = new Array(n + 1).fill(0), v = new Array(m + 1).fill(0), p = new Array(m + 1).fill(0), way = new Array(m + 1).fill(0);
  for (let i = 1; i <= n; i++) {
    p[0] = i;
    let j0 = 0;
    const minv = new Array(m + 1).fill(INF), used = new Array(m + 1).fill(false);
    do {
      used[j0] = true;
      const i0 = p[j0];
      let delta = INF, j1 = 0;
      for (let j = 1; j <= m; j++)
        if (!used[j]) {
          const cur = cost[i0 - 1][j - 1] - u[i0] - v[j];
          if (cur < minv[j]) { minv[j] = cur; way[j] = j0; }
          if (minv[j] < delta) { delta = minv[j]; j1 = j; }
        }
      for (let j = 0; j <= m; j++)
        if (used[j]) { u[p[j]] += delta; v[j] -= delta; } else minv[j] -= delta;
      j0 = j1;
    } while (p[j0] !== 0);
    do { const j1 = way[j0]; p[j0] = p[j1]; j0 = j1; } while (j0);
  }
  const ans = new Array(n).fill(-1);
  for (let j = 1; j <= m; j++) if (p[j]) ans[p[j] - 1] = j - 1;
  return ans;
}

export async function readPhoto(file: Blob, kinds: { main: string[]; minor: string[]; stage: string[] }): Promise<PhotoResult> {
  const [bmp, R] = await Promise.all([createImageBitmap(file, { imageOrientation: "from-image" }), refs()]);
  try {
    const { boxes, k } = findCards(bmp);
    if (boxes.length !== 26)
      throw new PhotoError(`照片裡找到 ${boxes.length} 張牌，要剛好 26 張：從正上方拍、整個牌陣都在畫面裡、牌不要重疊，旁邊不要放其他牌`);
    const cx = (b: Box) => b.cx, cy = (b: Box) => b.cy;
    const med = (a: number[]) => [...a].sort((p, q) => p - q)[a.length >> 1];
    const ch = med(boxes.map((b) => b.h)), cw = med(boxes.map((b) => b.w));
    const ys = boxes.map(cy).sort((a, b) => a - b), xs = boxes.map(cx).sort((a, b) => a - b);
    const top = boxes.filter((b) => cy(b) < ys[0] + ch * 0.5), bot = boxes.filter((b) => cy(b) > ys[25] - ch * 0.5);
    const rest = boxes.filter((b) => !top.includes(b) && !bot.includes(b));
    const left = rest.filter((b) => cx(b) < xs[0] + cw * 1.9), right = rest.filter((b) => cx(b) > xs[25] - cw * 1.9);
    const center = rest.filter((b) => !left.includes(b) && !right.includes(b)).sort((a, b) => cx(a) - cx(b));
    if (top.length !== 8 || bot.length !== 8 || left.length !== 4 || right.length !== 4 || center.length !== 2)
      throw new PhotoError("牌的排法對不上盤面（上下各 8 張、左右各 4 張、中間 2 張），照畫面上的盤擺好再拍");
    const byX = (a: Box[]) => [...a].sort((p, q) => cx(p) - cx(q));
    const byY = (a: Box[]) => [...a].sort((p, q) => cy(p) - cy(q));
    const pairs = (a: Box[]) => [0, 2, 4, 6].slice(0, a.length / 2).map((i) => a.slice(i, i + 2));
    // 一宮兩張裡如果有一張找得比較矮（牌面太暗），用旁邊那張的上下範圍
    const fix = ([a, b]: Box[]) =>
      a.h < 0.9 * b.h ? [{ ...a, cy: b.cy, h: b.h, th: b.th }, b] : b.h < 0.9 * a.h ? [a, { ...b, cy: a.cy, h: a.h, th: a.th }] : [a, b];
    const slot: Record<string, Box[]> = {};
    pairs(byX(top)).forEach((p, i) => (slot["巳午未申"[i]] = fix(p)));
    pairs(byX(bot)).forEach((p, i) => (slot["寅丑子亥"[i]] = fix(p)));
    const L = byY(left), Rt = byY(right);
    [L.slice(0, 2), L.slice(2)].forEach((p, i) => (slot["辰卯"[i]] = fix(byX(p))));
    [Rt.slice(0, 2), Rt.slice(2)].forEach((p, i) => (slot["酉戌"[i]] = fix(byX(p))));

    // 先把照片畫到寬 1500 的工作畫布（裁切再縮小時比較不會鋸齒）
    const WK = 1500, kk = bmp.width / WK;
    const work = document.createElement("canvas");
    work.width = WK;
    work.height = Math.round(bmp.height / kk);
    const wctx = work.getContext("2d")!;
    wctx.imageSmoothingQuality = "high";
    wctx.drawImage(bmp, 0, 0, work.width, work.height);
    const s9 = k / kk; // 寬 900 座標 → 工作畫布座標
    const mid = document.createElement("canvas");
    mid.width = GW * 2;
    mid.height = GH * 2;
    const mctx = mid.getContext("2d")!;
    mctx.imageSmoothingQuality = "high";
    const featsOf = (b: Box) => {
      const out: Feat[] = [];
      const c = Math.cos(b.th), sn = Math.sin(b.th), w = b.w * s9, h = b.h * s9;
      for (const dx of [-SHIFT, 0, SHIFT])
        for (const dy of [-SHIFT, 0, SHIFT]) {
          // 牌身座標 (qx,qy)（以牌中心為原點、沿牌身）→ 照片：p = 中心 + qx·(c,s) + qy·(−s,c)
          // 要讓 mid 畫布的 (u,v) 對到牌身的 qx = (−0.5+MX+dx)·w + u·sw/mw，qy 同理
          const sw = w * (1 - 2 * MX), sh = h * (1 - 2 * MY);
          const ax = sw / mid.width, ay = sh / mid.height;
          const qx0 = (-0.5 + MX + dx) * w, qy0 = (-0.5 + MY + dy) * h;
          const ox = b.cx * s9 + qx0 * c - qy0 * sn, oy = b.cy * s9 + qx0 * sn + qy0 * c;
          // 正向：p = [c·ax, −s·ay; s·ax, c·ay]·(u,v) + (ox,oy)；畫布要的是反向
          const A = c * ax, B = sn * ax, C = -sn * ay, D = c * ay; // p.x = A·u + C·v + ox；p.y = B·u + D·v + oy
          const det = A * D - B * C;
          mctx.setTransform(D / det, -B / det, -C / det, A / det, (C * oy - D * ox) / det, (B * ox - A * oy) / det);
          mctx.clearRect(-1e5, -1e5, 2e5, 2e5);
          mctx.drawImage(work, 0, 0);
          mctx.setTransform(1, 0, 0, 1, 0, 0);
          out.push(featOf(mid, 0, 0, mid.width, mid.height));
        }
      return out;
    };
    // 每格對每個候選牌：成本＝最像的那次平均差，順便記正倒
    const score = (b: Box, cands: string[]) => {
      const fs = featsOf(b);
      return cands.map((n) => {
        let best = Infinity, rev = false;
        for (const r of R.get(n) ?? [])
          for (const f of fs) {
            const up = dist(f, r.up), dn = dist(f, r.down);
            if (up < best) { best = up; rev = false; }
            if (dn < best) { best = dn; rev = n !== "空宮"; }
          }
        return { cost: best, rev };
      });
    };
    const decide = (rows: { key: string; box: Box }[], cands: string[]) => {
      const S = rows.map((r) => score(r.box, cands));
      const pick = assign(S.map((row) => row.map((s) => s.cost)));
      const out: Record<string, Pick> = {};
      rows.forEach((r, i) => {
        const j = pick[i], sorted = S[i].map((s) => s.cost).sort((a, b) => a - b);
        const c = S[i][j].cost;
        // 沒把握：比第二像的只好一點點、或本身就不太像、或被指派讓位（不是這格最像的那張）
        const doubt = sorted[1] - sorted[0] < 0.06 || c > 0.8 || c - sorted[0] > 0.02;
        out[r.key] = { name: cands[j], reversed: S[i][j].rev, doubt };
      });
      return out;
    };
    const BR = "子丑寅卯辰巳午未申酉戌亥";
    const mains = decide([...[...BR].map((b) => ({ key: b, box: slot[b][0] })), { key: "body", box: center[0] }], kinds.main);
    const minors = decide([...BR].map((b) => ({ key: b, box: slot[b][1] })), kinds.minor);
    const st = score(center[1], kinds.stage);
    const si = st.reduce((bi, s, i) => (s.cost < st[bi].cost ? i : bi), 0);
    const sSorted = st.map((s) => s.cost).sort((a, b) => a - b);
    const cells: PhotoResult["cells"] = {};
    for (const b of BR) cells[b] = { main: mains[b], minor: minors[b] };
    return {
      cells,
      body: mains.body,
      stage: { name: kinds.stage[si], reversed: st[si].rev, doubt: sSorted[1] - sSorted[0] < 0.06 || st[si].cost > 0.8 },
    };
  } finally {
    bmp.close();
  }
}
