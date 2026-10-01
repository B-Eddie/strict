// The judge: stroke -> image preprocessing, scoring, word alignment, char diffs.

export function charLevenshtein(a, b) {
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = new Array(n + 1), cur = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;
  for (let i = 1; i <= m; i++) {
    cur[0] = i;
    const ca = a[i - 1];
    for (let j = 1; j <= n; j++)
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (ca === b[j - 1] ? 0 : 1));
    const t = prev; prev = cur; cur = t;
  }
  return prev[n];
}

export const normalize = (s) => s.toLowerCase().replace(/\s+/g, " ").trim();

// score = 100 * (1 - char_levenshtein(intended, recognized) / len(intended)), clamped 0..100
export function legibilityScore(intended, recognized) {
  const a = normalize(intended), b = normalize(recognized);
  if (!a.length) return 0;
  return Math.max(0, Math.min(100, Math.round(100 * (1 - charLevenshtein(a, b) / a.length))));
}

// Word alignment: tokenize on whitespace, align with word-level edit distance (DP).
// Returns [{ intended: string|null, recognized: string|null }]
export function alignWords(intended, recognized) {
  const A = normalize(intended).split(" ").filter(Boolean);
  const B = normalize(recognized).split(" ").filter(Boolean);
  const m = A.length, n = B.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + (A[i - 1] === B[j - 1] ? 0 : 2)
      );
  const pairs = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && A[i - 1] === B[j - 1]) { pairs.push({ intended: A[i - 1], recognized: B[j - 1] }); i--; j--; }
    else if (i > 0 && j > 0 && dp[i][j] === dp[i - 1][j - 1] + 2) { pairs.push({ intended: A[i - 1], recognized: B[j - 1] }); i--; j--; }
    else if (j > 0 && dp[i][j] === dp[i][j - 1] + 1) { pairs.push({ intended: null, recognized: B[j - 1] }); j--; }
    else { pairs.push({ intended: A[i - 1], recognized: null }); i--; }
  }
  return pairs.reverse();
}

// Character diff between two known words -> [{ ch, same }]
export function charDiff(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  const ops = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) { ops.push({ ch: a[i - 1], same: true }); i--; j--; }
    else if (j > 0 && (i === 0 || dp[i][j] === dp[i][j - 1] + 1)) { ops.push({ ch: b[j - 1], same: false, extra: true }); j--; }
    else if (i > 0 && (j === 0 || dp[i][j] === dp[i - 1][j] + 1)) { ops.push({ ch: a[i - 1], same: false, missing: true }); i--; }
    else { ops.push({ ch: b[j - 1], same: false, was: a[i - 1] }); i--; j--; }
  }
  return ops.reverse();
}

// ---- stroke -> image preprocessing ----
// 1. crop to ink bbox + 10% pad; 2. split line strips (gaps >= 1.5x median line
// height); 3. grayscale + contrast normalize; 4. caller feeds each strip blob
// to the recognizer (one pass per strip, concatenated with spaces).
export async function preprocessStrokes(strokes, srcCanvas) {
  const strips = splitLineStrips(strokes);
  return Promise.all(strips.map((strip) => stripToBlob(strip, srcCanvas)));
}

function stripBBox(strokes) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const s of strokes)
    for (const p of s.points) {
      if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y;
      if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y;
    }
  return { x0, y0, x1, y1 };
}

function splitLineStrips(strokes) {
  if (!strokes.length) return [];
  const boxes = strokes.map((s) => ({ s, b: stripBBox([s]) }));
  boxes.sort((a, b) => (a.b.y0 + a.b.y1) / 2 - (b.b.y0 + b.b.y1) / 2);
  const heights = boxes.map((x) => x.b.y1 - x.b.y0).sort((a, b) => a - b);
  const medianH = heights[Math.floor(heights.length / 2)] || 40;
  const lines = [];
  let cur = [boxes[0]], curBottom = boxes[0].b.y1;
  for (let k = 1; k < boxes.length; k++) {
    const gap = boxes[k].b.y0 - curBottom;
    if (gap >= 1.5 * medianH) { lines.push(cur); cur = []; }
    cur.push(boxes[k]);
    curBottom = Math.max(curBottom, boxes[k].b.y1);
  }
  lines.push(cur);
  return lines.map((l) => l.map((x) => x.s));
}

function stripToBlob(strokes, srcCanvas) {
  const b = stripBBox(strokes);
  const padX = (b.x1 - b.x0) * 0.1 + 8;
  const padY = (b.y1 - b.y0) * 0.1 + 8;
  const sx = Math.max(0, b.x0 - padX), sy = Math.max(0, b.y0 - padY);
  const sw = Math.min(srcCanvas.width - sx, b.x1 - b.x0 + padX * 2);
  const sh = Math.min(srcCanvas.height - sy, b.y1 - b.y0 + padY * 2);

  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(sw));
  c.height = Math.max(1, Math.round(sh));
  const ctx = c.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, c.width, c.height);

  // grayscale + contrast normalize
  const img = ctx.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  let lo = 255, hi = 0;
  const gray = new Uint8ClampedArray(c.width * c.height);
  for (let i = 0; i < gray.length; i++) {
    const g = 0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2];
    gray[i] = g;
    if (g < lo) lo = g; if (g > hi) hi = g;
  }
  const span = Math.max(1, hi - lo);
  for (let i = 0; i < gray.length; i++) {
    const v = Math.round(((gray[i] - lo) / span) * 255);
    d[i * 4] = d[i * 4 + 1] = d[i * 4 + 2] = v;
    d[i * 4 + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return new Promise((res, rej) =>
    c.toBlob((b) => b ? res(b) : rej(new Error("could not rasterize ink")), "image/png")
  );
}
