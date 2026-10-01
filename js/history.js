// Score history: append-only strict_history [{ day, score, tier, promptId }].
const KEY = "strict_history";

export function loadHistory() {
  try {
    const raw = localStorage.getItem(KEY);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}

export function saveResult({ score, tier, promptId }) {
  const day = new Date().toISOString().slice(0, 10);
  const h = loadHistory();
  h.push({ day, score, tier, promptId });
  try { localStorage.setItem(KEY, JSON.stringify(h)); } catch { /* storage full: drop */ }
  return h;
}

// Streak = consecutive days (ending today or yesterday) with >= 1 graded page.
export function streak(history) {
  const days = new Set(history.map((r) => r.day));
  let n = 0;
  const d = new Date();
  if (!days.has(d.toISOString().slice(0, 10))) d.setDate(d.getDate() - 1);
  while (days.has(d.toISOString().slice(0, 10))) { n++; d.setDate(d.getDate() - 1); }
  return n;
}

export function bestScore(history) {
  return history.reduce((m, r) => Math.max(m, r.score), 0);
}
