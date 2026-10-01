// Strict service worker.
// SHELL: app code, precached on install (version-pinned).
// MODELS: PaddleOCR.js model tars, version-pinned cache populated by the app's
// first-run download UI (real progress) and served cache-first afterwards.
const SHELL_CACHE = "strict-shell-v1";
const MODEL_CACHE = "strict-models-v1";

const SHELL = [
  "/",
  "/index.html",
  "/styles.css",
  "/manifest.webmanifest",
  "/js/app.js",
  "/js/prompts.js",
  "/js/canvas.js",
  "/js/recognizer.js",
  "/js/judge.js",
  "/js/roast.js",
  "/js/history.js",
  "/js/report.js",
  "/vendor/strict-vendor.js",
  "/vendor/wasm/ort-wasm-simd-threaded.mjs",
  "/vendor/wasm/ort-wasm-simd-threaded.wasm",
  "/vendor/wasm/ort-wasm-simd-threaded.jsep.mjs",
  "/vendor/wasm/ort-wasm-simd-threaded.jsep.wasm",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(SHELL_CACHE).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting())
  );
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

  // Models: cache-first (populated by first-run UI). If evicted/missing and
  // offline, this fails and the app falls back to the download UI.
  if (url.pathname.startsWith("/models/")) {
    e.respondWith(
      caches.open(MODEL_CACHE).then((c) =>
        c.match(e.request).then((hit) => hit || fetch(e.request))
      )
    );
    return;
  }

  // Shell: cache-first, network fallback.
  e.respondWith(
    caches.match(e.request).then((hit) => hit || fetch(e.request))
  );
});
