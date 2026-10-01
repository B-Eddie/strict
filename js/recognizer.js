// Recognizer module boundary.
//
// Interface every recognizer backend must implement:
//   createPaddleRecognizer(opts) -> { load() => Promise<void>,
//                                    recognize(imageBlob) => Promise<Array<{text, score}>> }
//
// The SDK's predict() resolves to an ARRAY of per-image results
// ([{ image, items: [{poly, text, score}], metrics }]) even for a single
// input — we unwrap it here so callers always get a flat item list.
//
// v1 backend: PaddleOCR.js (official SDK, PP-OCRv5 in-browser).
// Future backends (native Vision, stroke-geometry judge) slot in here.
//
// IMPORTANT: onnxruntime-web caches backend init failures in a per-page
// registry — once initWasm() fails, every later create() in the same page
// returns "previous call to 'initWasm()' failed" even if the underlying
// cause is gone. So on failure we surface the ORIGINAL error and let the
// caller reload for a clean slate, instead of retrying in place.
// Diagnostics: onnxruntime-web poisons its per-page backend registry on the
// FIRST initWasm() failure, so a later create() only surfaces the follow-on
// "previous call to 'initWasm()' failed" while the original error stays buried
// in the vendored init chain. Capture the environment facts plus the first
// error we catch, so a failed boot on a real device reports something
// actionable instead of the follow-on.
let firstInitError = null;

function errorText(e, depth) {
  if (!e || depth > 3) return "";
  const head = (e && e.message) || String(e);
  const tail = errorText(e && e.cause, depth + 1);
  return tail ? head + "\ncaused by: " + tail : head;
}

function wasmThreadsSupported() {
  // Mirrors onnxruntime-web's own capability probe (shared memory +
  // threads opcode validation).
  if (typeof SharedArrayBuffer === "undefined") return false;
  try {
    if (typeof MessageChannel === "undefined") return false;
    new MessageChannel().port1.postMessage(new SharedArrayBuffer(1));
    return WebAssembly.validate(new Uint8Array([0,97,115,109,1,0,0,0,1,4,1,96,0,0,3,2,1,0,5,4,1,3,1,1,10,11,1,9,0,65,0,254,16,2,0,26,11]));
  } catch { return false; }
}

export function recognizerDiagnostics() {
  const ua = navigator.userAgent || "";
  const iOS = /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return {
    iOS,
    crossOriginIsolated: !!self.crossOriginIsolated,
    sharedArrayBuffer: typeof SharedArrayBuffer !== "undefined",
    wasmThreads: wasmThreadsSupported(),
    cores: navigator.hardwareConcurrency || null,
    deviceMemoryGB: navigator.deviceMemory || null,
    // Pinned build: onnxruntime-web 1.30.0, threaded jsep wasm, proxy worker
    // disabled (init runs on the already-isolated main thread — iOS Safari
    // does not propagate COI into blob-URL workers). The vendored jsep.mjs
    // is patched to cap the shared WASM memory at 1 GiB (maximum:16384
    // pages): Apple mobile WebKit caps each shared WebAssembly.Memory at
    // 1 GiB, and the stock 4 GiB maximum throws RangeError: Out of memory
    // at initWasm on iOS even when the page is cross-origin isolated.
    ortBuild: "ort-wasm-simd-threaded.jsep@1.30.0+proxy=false+memmax1g",
    firstError: firstInitError ? errorText(firstInitError, 0) : null,
    firstStack: firstInitError && firstInitError.stack ? String(firstInitError.stack).slice(0, 2000) : null,
  };
}

export async function createPaddleRecognizer({ detUrl, recUrl, wasmPaths, ortOptions }) {
  const { PaddleOCR } = window.StrictVendor || {};
  if (!PaddleOCR) throw new Error("StrictVendor bundle not loaded");
  let ocr = null;

  async function load() {
    try {
      ocr = await PaddleOCR.create({
        textDetectionModelName: "PP-OCRv5_mobile_det",
        textDetectionModelAsset: { url: detUrl },
        textRecognitionModelAsset: { url: recUrl },
        textRecognitionModelName: "PP-OCRv5_mobile_rec",
        ortOptions: { backend: "auto", wasmPaths, ...(ortOptions || {}) },
      });
    } catch (e) {
      if (!firstInitError) firstInitError = e;
      const msg = errorText(e, 0).split("\n")[0];
      throw new Error("recognizer init failed: " + msg);
    }
  }

  async function recognize(blob) {
    if (!ocr) throw new Error("recognizer not loaded");
    if (!blob) throw new Error("no ink image to recognize");
    const out = await ocr.predict(blob);
    const first = Array.isArray(out) ? out[0] : out;
    const items = (first && first.items) || [];
    return items.map((i) => ({ text: i.text || "", score: i.score || 0 }));
  }

  return { load, recognize };
}
