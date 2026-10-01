// Illegibility Report Card: 1080x1350 canvas PNG + navigator.share fallback.
import { TIER_LABEL } from "./roast.js";

export async function renderReportCard({ score, tier, promptText, day, streak }) {
  const W = 1080, H = 1350;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const x = c.getContext("2d");

  // paper
  x.fillStyle = "#f7f2e7"; x.fillRect(0, 0, W, H);
  x.strokeStyle = "#1b2340"; x.lineWidth = 6; x.strokeRect(30, 30, W - 60, H - 60);

  x.fillStyle = "#1b2340"; x.textAlign = "center";
  x.font = "700 44px Georgia, serif";
  x.fillText("ILLEGIBILITY REPORT CARD", W / 2, 130);
  x.font = "italic 30px Georgia, serif"; x.fillStyle = "#8a8578";
  x.fillText("judged by Strict", W / 2, 180);

  // big score
  x.fillStyle = score >= 65 ? "#1b7a3d" : "#b3372a";
  x.font = "700 300px Georgia, serif";
  x.fillText(String(score), W / 2, 520);
  x.fillStyle = "#8a8578"; x.font = "30px Georgia, serif";
  x.fillText("/ 100 legibility", W / 2, 575);

  // tier stamp
  x.save();
  x.translate(W / 2, 700); x.rotate(-0.06);
  x.strokeStyle = "#b3372a"; x.lineWidth = 5;
  x.font = "700 54px Georgia, serif"; x.fillStyle = "#b3372a";
  const label = TIER_LABEL[tier].toUpperCase();
  const tw = x.measureText(label).width;
  x.strokeRect(-tw / 2 - 30, -62, tw + 60, 100);
  x.fillText(label, 0, 12);
  x.restore();

  // prompt excerpt
  x.fillStyle = "#1b2340"; x.font = "italic 34px Georgia, serif";
  wrap(x, "\u201c" + promptText + "\u201d", W / 2, 830, 880, 46);

  // meta
  x.fillStyle = "#8a8578"; x.font = "30px system-ui, sans-serif"; x.textAlign = "center";
  x.fillText(day + "  ·  " + streak + "-day streak", W / 2, 1150);
  x.font = "700 34px system-ui, sans-serif"; x.fillStyle = "#1b2340";
  x.fillText(score >= 65 ? "CERTIFIED READABLE" : "NEEDS WORK", W / 2, 1220);

  return new Promise((res) => c.toBlob(res, "image/png"));
}

function wrap(x, text, cx, y, maxW, lh) {
  const words = text.split(" ");
  let line = "", yy = y;
  for (const w of words) {
    const t = line ? line + " " + w : w;
    if (x.measureText(t).width > maxW && line) { x.fillText(line, cx, yy); line = w; yy += lh; }
    else line = t;
  }
  x.fillText(line, cx, yy);
}

export async function shareReportCard(blob, filename) {
  const file = new File([blob], filename || "strict-report.png", { type: "image/png" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    await navigator.share({ files: [file], title: "My Strict report card" });
    return "shared";
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename || "strict-report.png";
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return "downloaded";
}
