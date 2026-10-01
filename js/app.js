import { PROMPTS, TIER_NAMES } from "./prompts.js";
import { InkCanvas } from "./canvas.js";
import { createPaddleRecognizer } from "./recognizer.js";
import {
  preprocessStrokes, legibilityScore, alignWords, charDiff, normalize,
} from "./judge.js";
import { roast, verdict, TIER_LABEL, TIER_SUB } from "./roast.js";
import { loadHistory, saveResult, streak, bestScore } from "./history.js";
import { renderReportCard, shareReportCard } from "./report.js";

const MODEL_CACHE = "strict-models-v1";
const DET_URL = "/models/PP-OCRv5_mobile_det.tar";
const REC_URL = "/models/PP-OCRv5_mobile_rec.tar";
const WASM_PATHS = "/vendor/wasm/";

const $ = (id) => document.getElementById(id);
const screens = ["loading", "practice", "result", "history"];
let ink = null; // assigned in initPractice; show() may run before it
function show(name) {
  for (const s of screens) $("screen-" + s).classList.toggle("active", s === name);
  window.scrollTo(0, 0);
  // the pad canvas is display:none until this screen shows; re-fit it now
  if (name === "practice" && ink) ink.refresh();
}

const state = {
  tier: "teacher",
  prompt: null,
  recognizer: null,
  lastResult: null,
  seed: 0,
};

function pickPrompt(tierWanted) {
  const pool = PROMPTS.filter((p) => !tierWanted || p.tier === tierWanted);
  return pool[Math.floor(Math.random() * pool.length)];
}

// ---------- boot ----------
async function boot() {
  show("loading");
  try {
    if (navigator.storage && navigator.storage.persist) {
      try { await navigator.storage.persist(); } catch {}
    }
    if ("serviceWorker" in navigator) {
      try { await navigator.serviceWorker.register("/sw.js"); } catch (e) { console.warn("sw failed", e); }
    }
    setLoadStatus("Checking the judge's library…");
    const need = await missingModels();
    if (need.length) {
      await downloadModels(need);
    } else {
      setLoadStatus("Judge is ready.");
    }
    setLoadStatus("Warming up the judge…");
    state.recognizer = await createPaddleRecognizer({ detUrl: DET_URL, recUrl: REC_URL, wasmPaths: WASM_PATHS });
    await state.recognizer.load();
    newPrompt();
    show("practice");
    refreshStreakPill();
  } catch (e) {
    setLoadStatus("The judge failed to wake up: " + (e.message || e));
    console.error(e);
  }
}

function setLoadStatus(t) { $("load-status").textContent = t; }

async function missingModels() {
  try {
    if (!(await caches.has(MODEL_CACHE))) return [DET_URL, REC_URL];
    const c = await caches.open(MODEL_CACHE);
    const out = [];
    for (const u of [DET_URL, REC_URL]) if (!(await c.match(u))) out.push(u);
    return out;
  } catch { return [DET_URL, REC_URL]; }
}

async function downloadModels(urls) {
  const cache = await caches.open(MODEL_CACHE);
  const bar = $("load-bar"), pct = $("load-pct");
  $("load-progress").style.display = "block";
  let done = 0;
  const total = urls.length;
  for (const url of urls) {
    const name = url.split("/").pop();
    setLoadStatus("Downloading " + name + "…");
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error("download failed: " + url);
    const len = +(res.headers.get("content-length") || 0);
    const reader = res.body.getReader();
    const chunks = [];
    let got = 0;
    for (;;) {
      const { done: d, value } = await reader.read();
      if (d) break;
      chunks.push(value);
      got += value.length;
      const mb = (got / 1048576).toFixed(1);
      const tot = len ? (len / 1048576).toFixed(1) + " MB" : "…";
      pct.textContent = name + ": " + mb + " / " + tot + " MB";
      bar.style.width = Math.round(((done + (len ? got / len : 0.5)) / total) * 100) + "%";
    }
    await cache.put(url, new Response(new Blob(chunks), { headers: res.headers }));
    done++;
  }
  $("load-progress").style.display = "none";
}

// ---------- practice screen ----------
function initPractice() {
  ink = new InkCanvas($("pad"));
  ink.onChange = () => { $("btn-judge").disabled = ink.isEmpty(); };
  $("btn-judge").disabled = true;
  document.querySelectorAll(".tier-btn").forEach((b) =>
    b.addEventListener("click", () => {
      document.querySelectorAll(".tier-btn").forEach((x) => x.classList.remove("sel"));
      b.classList.add("sel");
      state.tier = b.dataset.tier;
      renderPrompt();
    })
  );
  $("btn-clear").addEventListener("click", () => ink.clear());
  $("btn-undo").addEventListener("click", () => ink.undo());
  $("btn-judge").addEventListener("click", judge);
  $("btn-newprompt").addEventListener("click", () => { newPrompt(); ink.clear(); });
  $("btn-history").addEventListener("click", () => { renderHistory(); show("history"); });
  $("btn-back").addEventListener("click", () => show("practice"));
  $("btn-retry").addEventListener("click", () => { ink.clear(); show("practice"); });
  $("btn-newprompt2").addEventListener("click", () => { newPrompt(); ink.clear(); show("practice"); });
  $("btn-card").addEventListener("click", makeCard);
  $("btn-history2").addEventListener("click", () => { renderHistory(); show("history"); });
  // test hook (used by headless validation; harmless in production)
  window.Strict = { get ink() { return ink; }, state, newPrompt, judge };
}

function newPrompt() {
  state.prompt = pickPrompt();
  state.seed++;
  renderPrompt();
}

function renderPrompt() {
  const p = state.prompt;
  $("prompt-text").textContent = "\u201c" + p.text + "\u201d";
  $("prompt-tier").textContent = TIER_NAMES[p.tier];
}

function refreshStreakPill() {
  const h = loadHistory();
  const s = streak(h);
  $("streak-pill").textContent = s > 0 ? "\u{1F525} " + s + "-day streak" : "no streak yet";
}

// ---------- judging ----------
async function judge() {
  if (ink.isEmpty()) return;
  $("judge-overlay").classList.add("show");
  $("judge-status").textContent = "The judge is squinting…";
  try {
    const strips = await preprocessStrokes(ink.strokes, ink.canvas);
    if (!strips.length) throw new Error("no ink found");
    let recognized = "";
    const confs = [];
    for (const blob of strips) {
      const items = await state.recognizer.recognize(blob);
      recognized += (recognized ? " " : "") + items.map((i) => i.text).join(" ");
      for (const it of items) confs.push(it.score || 0);
    }
    const score = legibilityScore(state.prompt.text, recognized);
    const passed = verdict(state.tier, score);
    const pairs = alignWords(state.prompt.text, recognized);
    const meanConf = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0;
    state.lastResult = { score, passed, recognized, pairs, meanConf, prompt: state.prompt, tier: state.tier, seed: state.seed };
    saveResult({ score, tier: state.tier, promptId: state.prompt.id });
    refreshStreakPill();
    renderResult(state.lastResult);
    show("result");
  } catch (e) {
    console.error(e);
    $("judge-status").textContent = "The judge choked: " + (e.message || e);
    await new Promise((r) => setTimeout(r, 1800));
  } finally {
    $("judge-overlay").classList.remove("show");
  }
}

function renderResult(r) {
  $("score-num").textContent = r.score;
  $("score-num").className = "score-num " + (r.passed ? "pass" : "fail");
  $("verdict-stamp").textContent = r.passed ? "PASS" : "FAIL";
  $("verdict-stamp").className = "stamp " + (r.passed ? "pass" : "fail");
  $("verdict-tier").textContent = TIER_LABEL[r.tier] + " · needed " +
    ({ lenient: 40, teacher: 65, merciless: 85 })[r.tier];
  $("roast-line").textContent = roast(r.tier, r.passed, r.seed);

  const wrap = $("word-diff");
  wrap.innerHTML = "";
  for (const p of r.pairs) {
    const row = document.createElement("div");
    row.className = "word-row" + (!p.intended || !p.recognized || p.intended !== p.recognized ? " bad" : "");
    if (p.intended && p.recognized && p.intended === p.recognized) {
      row.innerHTML = `<span class="w ok-word">${esc(p.intended)}</span>`;
    } else if (p.intended && p.recognized) {
      row.innerHTML = `<span class="w intended">${diffHtml(p.intended, p.recognized).intended}</span>
        <span class="arrow">→</span>
        <span class="w read">${diffHtml(p.intended, p.recognized).recognized}</span>`;
    } else if (p.intended) {
      row.innerHTML = `<span class="w intended">${esc(p.intended)}</span><span class="arrow">→</span><span class="w read missing">∅ unread</span>`;
    } else {
      row.innerHTML = `<span class="w intended missing">∅ extra</span><span class="arrow">→</span><span class="w read">${esc(p.recognized)}</span>`;
    }
    wrap.appendChild(row);
  }
  if (!r.recognized.trim()) {
    wrap.innerHTML = `<div class="no-read">I see nothing. Write something.</div>`;
  }
  const shaky = r.pairs.filter((p) => !p.intended || !p.recognized || p.intended !== p.recognized).length;
  $("callout-line").textContent = shaky
    ? shaky + (shaky === 1 ? " word" : " words") + " off — check the red letters."
    : "Every word read as written. Suspiciously good.";
}

function diffHtml(intended, recognized) {
  const ops = charDiff(normalize(intended), normalize(recognized));
  // render intended with deletions highlighted, recognized with insertions/substitutions highlighted
  let ih = "", rh = "";
  for (const o of ops) {
    if (o.same) { ih += esc(o.ch); rh += esc(o.ch); }
    else if (o.extra) { rh += `<mark>${esc(o.ch)}</mark>`; }
    else if (o.missing) { ih += `<mark>${esc(o.ch)}</mark>`; }
    else { ih += `<mark>${esc(o.was)}</mark>`; rh += `<mark>${esc(o.ch)}</mark>`; }
  }
  return { intended: ih, recognized: rh };
}

function esc(s) {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// ---------- report card ----------
async function makeCard() {
  const r = state.lastResult;
  if (!r) return;
  $("btn-card").disabled = true;
  $("btn-card").textContent = "Drawing…";
  try {
    const h = loadHistory();
    const blob = await renderReportCard({
      score: r.score, tier: r.tier, promptText: r.prompt.text,
      day: new Date().toISOString().slice(0, 10), streak: streak(h),
    });
    await shareReportCard(blob, "strict-report-" + Date.now() + ".png");
  } catch (e) {
    console.error(e);
    alert("Could not make the card: " + (e.message || e));
  } finally {
    $("btn-card").disabled = false;
    $("btn-card").textContent = "Report card";
  }
}

// ---------- history ----------
function renderHistory() {
  const h = loadHistory().slice().reverse();
  $("hist-streak").textContent = streak(loadHistory());
  $("hist-best").textContent = bestScore(loadHistory());
  $("hist-count").textContent = h.length;
  const list = $("hist-list");
  list.innerHTML = h.length ? "" : `<div class="hist-empty">No pages judged yet. Go write something.</div>`;
  for (const r of h.slice(0, 60)) {
    const p = PROMPTS.find((x) => x.id === r.promptId);
    const div = document.createElement("div");
    div.className = "hist-row";
    div.innerHTML = `<span class="hist-score ${r.score >= 65 ? "pass" : "fail"}">${r.score}</span>
      <span class="hist-meta">${esc(r.day)} · ${TIER_LABEL[r.tier]}<br><span class="hist-prompt">${esc(p ? p.text : r.promptId)}</span></span>`;
    list.appendChild(div);
  }
}

document.addEventListener("DOMContentLoaded", () => {
  initPractice();
  boot();
});
