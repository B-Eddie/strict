// Recognizer module boundary.
//
// Interface every recognizer backend must implement:
//   createPaddleRecognizer(opts) -> { load() => Promise<void>,
//                                    recognize(imageBlob) => Promise<string> }
//
// v1 backend: PaddleOCR.js (official SDK, PP-OCRv5 in-browser).
// Future backends (native Vision, stroke-geometry judge) slot in here.
//
// IMPORTANT: onnxruntime-web caches backend init failures in a per-page
// registry — once initWasm() fails, every later create() in the same page
// returns "previous call to 'initWasm()' failed" even if the underlying
// cause is gone. So on failure we surface the ORIGINAL error and let the
// caller reload for a clean slate, instead of retrying in place.
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
      throw new Error("recognizer init failed: " + (e && e.message || e));
    }
  }

  async function recognize(blob) {
    if (!ocr) throw new Error("recognizer not loaded");
    if (!blob) throw new Error("no ink image to recognize");
    const out = await ocr.predict(blob);
    return (out && out.text) || "";
  }

  return { load, recognize };
}
