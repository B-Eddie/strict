// Score history: append-only strict_history [{ day, score, tier, promptId }].
const KEY = "strict_history";

// Local calendar day (YYYY-MM-DD). toISOString() is UTC and would flip the
// day near midnight for anyone west of Greenwich, breaking streaks.
export function localDay(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return d.getFullYear() + "-" + m + "-" + dd;
}

function validEntry(r) {
  return r && typeof r === "object" &&
    typeof r.day === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.day) &&
    typeof r.score === "number" && Number.isFinite(r.score) &&
    (r.tier === undefined || ["lenient", "teacher", "merciless"].includes(r.tier));
}

export function loadHistory() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    // Guard against half-written / hand-edited / downgraded entries:
    // one malformed row must not break the history screen or streak math.
    return Array.isArray(arr) ? arr.filter(validEntry) : [];
  } catch { return []; }
}

export function saveResult({ score, tier, promptId }) {
  const day = localDay();
  const h = loadHistory();
  h.push({ day, score, tier, promptId });
  try { localStorage.setItem(KEY, JSON.stringify(h)); } catch { /* storage full: drop */ }
  return h;
}

// Streak = consecutive local days (ending today or yesterday) with >= 1 graded page.
export function streak(history) {
  const days = new Set(history.map((r) => r.day));
  let n = 0;
  const d = new Date();
  if (!days.has(localDay(d))) d.setDate(d.getDate() - 1);
  while (days.has(localDay(d))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export function bestScore(history) {
  return history.reduce((m, r) => Math.max(m, r.score), 0);
}
