// Strict service worker v3.
// SHELL: app code, precached on install (version-pinned).
// MODELS: PaddleOCR.js model tars, cache-first (populated by the app's
// first-run download UI with real progress).
// COI: adds Cross-Origin-Opener-Policy / Cross-Origin-Embedder-Policy to
// same-origin responses. GitHub Pages cannot send these headers, but the
// threaded WASM runtime (onnxruntime-web) requires a cross-origin-isolated
// page to allocate shared WebAssembly memory — without them OCR init fails
// on iOS Safari with "no available backend found". Rewrapping a cached or
// network response with the headers at serve time applies them to document
// loads as well, so the page becomes crossOriginIsolated.
const SHELL_CACHE = "strict-shell-v7";
// NOTE: model cache name must match MODEL_CACHE in js/app.js, or the
// service worker's activate cleanup will delete the app-managed models.
const MODEL_CACHE = "strict-models-v1";

// Base path of the app ("/" locally, "/strict/" on GitHub Pages).
const BASE = new URL("./", self.location).pathname;
const MODELS_PREFIX = new URL("./models/", self.location).pathname;

const SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./js/app.js",
  "./js/prompts.js",
  "./js/canvas.js",
  "./js/recognizer.js",
  "./js/judge.js",
  "./js/roast.js",
  "./js/history.js",
  "./js/report.js",
  "./vendor/strict-vendor.js",
  // Only the jsep pair is ever loaded (see WASM_PATHS in js/app.js); the
  // classic ort-wasm-simd-threaded.* files are dead weight — do NOT precache.
  "./vendor/wasm/ort-wasm-simd-threaded.jsep.mjs",
  "./vendor/wasm/ort-wasm-simd-threaded.jsep.wasm",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
];

function withCoiHeaders(res) {
  if (!res) return res;
  const headers = new Headers(res.headers);
  headers.set("Cross-Origin-Opener-Policy", "same-origin");
  headers.set("Cross-Origin-Embedder-Policy", "require-corp");
  // res.body is already content-decoded by fetch(); a stale
  // content-encoding/content-length would corrupt downstream reads.
  headers.delete("content-encoding");
  headers.delete("content-length");
  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers,
  });
}

self.addEventListener("install", (e) => {
  e.waitUntil((async () => {
    const c = await caches.open(SHELL_CACHE);
    // addAll is all-or-nothing: one flaky 40MB wasm on a bad connection
    // would fail the whole install, leaving no worker, no COOP/COEP, and a
    // dead app. Cache per-asset instead; only fail if a CORE file (needed
    // to render anything at all) didn't make it — the fetch handler falls
    // back to network for the rest.
    const CORE = new Set(["./", "./index.html", "./styles.css", "./js/app.js", "./vendor/strict-vendor.js"]);
    const results = await Promise.allSettled(SHELL.map((u) => c.add(u)));
    const failedCore = [];
    results.forEach((r, i) => {
      if (r.status === "rejected") {
        console.warn("[strict sw] precache failed:", SHELL[i], r.reason);
        if (CORE.has(SHELL[i])) failedCore.push(SHELL[i]);
      }
    });
    if (failedCore.length) throw new Error("core precache failed: " + failedCore.join(", "));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== SHELL_CACHE && k !== MODEL_CACHE)
          .map((k) => caches.delete(k))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (url.origin !== self.location.origin || e.request.method !== "GET") return;
  if (e.request.headers.has("range")) return; // never rewrite range requests

  // Models: cache-first (populated by first-run UI). If evicted/missing and
  // offline, this fails and the app falls back to the download UI.
  if (url.pathname.startsWith(MODELS_PREFIX)) {
    e.respondWith(
      caches.open(MODEL_CACHE).then((c) =>
        c.match(e.request).then((hit) => withCoiHeaders(hit) || fetch(e.request).then(withCoiHeaders))
      )
    );
    return;
  }

  // Shell: cache-first, network fallback.
  e.respondWith(
    caches.match(e.request).then((hit) => withCoiHeaders(hit) || fetch(e.request).then(withCoiHeaders))
  );
});
