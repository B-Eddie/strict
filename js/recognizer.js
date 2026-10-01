// Recognizer module boundary.
//
// Interface every recognizer backend must implement:
//   createRecognizer(opts) -> { load(onProgress) => Promise<void>,
//                              recognize(imageBlob) => Promise<[{ text, score, poly }]> }
//
// v1 backend: PaddleOCR.js (official SDK, PP-OCRv5 in-browser).
// Future backends (native Vision, stroke-geometry judge) slot in here.

export async function createPaddleRecognizer({ detUrl, recUrl, wasmPaths }) {
  const { PaddleOCR } = window.StrictVendor || {};
  if (!PaddleOCR) throw new Error("StrictVendor bundle not loaded");

  let ocr = null;

  async function load() {
    ocr = await PaddleOCR.create({
      textDetectionModelName: "PP-OCRv5_mobile_det",
      textDetectionModelAsset: { url: detUrl },
      textRecognitionModelName: "PP-OCRv5_mobile_rec",
      textRecognitionModelAsset: { url: recUrl },
      ortOptions: { backend: "auto", wasmPaths },
    });
  }

  async function recognize(imageBlob) {
    if (!ocr) throw new Error("recognizer not loaded");
    const results = await ocr.predict(imageBlob);
    const items = [];
    for (const r of results || []) {
      for (const it of r.items || []) {
        items.push({ text: it.text || "", score: it.score ?? 0, poly: it.poly || null });
      }
    }
    return items;
  }

  return { load, recognize };
}
