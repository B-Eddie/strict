// Stroke capture + rendering. Pointer Events + getCoalescedEvents() + pressure.
export class InkCanvas {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.strokes = [];
    this.current = null;
    this.activeId = null; // the one pointer currently drawing (pencil/finger)
    this.activeType = null; // its pointerType ("pen" outranks "touch")
    this.onChange = null;
    this._resize();
    this._bind();
    // iOS Safari fires resize when the toolbar shows/hides on scroll; the
    // canvas rect genuinely changes with 46dvh, but reallocating the
    // backing store mid-scroll is jank and can shift ink. Debounce and
    // ignore sub-8px height-only wobbles.
    this._resizeTimer = null;
    this._lastRectW = 0;
    this._lastRectH = 0;
    window.addEventListener("resize", () => {
      clearTimeout(this._resizeTimer);
      this._resizeTimer = setTimeout(() => {
        const r = this.canvas.getBoundingClientRect();
        const dw = Math.abs(r.width - this._lastRectW);
        const dh = Math.abs(r.height - this._lastRectH);
        if (dw < 1 && dh < 8) return; // toolbar wobble, not a real resize
        this._resize(true);
      }, 150);
    });
  }

  _resize(keep = false) {
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (this.canvas.width === w && this.canvas.height === h) return;
    this.canvas.width = w;
    this.canvas.height = h;
    this.dpr = dpr;
    this._lastRectW = rect.width;
    this._lastRectH = rect.height;
    if (keep) this.redraw();
    else this._paintPaper();
  }

  _paintPaper() {
    const { ctx, canvas } = this;
    ctx.fillStyle = "#fdfcf8";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  // Re-measure against the laid-out element. Call whenever the canvas may
  // have been hidden (display:none) at construction or screen switches.
  refresh() { this._resize(true); }

  _bind() {
    const c = this.canvas;
    c.style.touchAction = "none";
    c.addEventListener("pointerdown", (e) => {
      // One active pointer at a time: a second finger (palm) must not
      // clobber the stroke in progress — EXCEPT the Apple Pencil always
      // wins: a resting palm that lands before the pencil is the common
      // physical order on iPad, and the half-formed palm touch is junk.
      if (this.activeId !== null) {
        if (e.pointerType === "pen" && this.activeType !== "pen") {
          this.current = null; // abandon the palm's partial stroke
          this.activeId = null;
        } else {
          return;
        }
      }
      e.preventDefault();
      try { c.setPointerCapture(e.pointerId); } catch {}
      this.activeId = e.pointerId;
      this.activeType = e.pointerType || "unknown";
      this.current = { points: [] };
      this._addPoint(e);
    });
    c.addEventListener("pointermove", (e) => {
      if (!this.current || e.pointerId !== this.activeId) return;
      e.preventDefault();
      const evts = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evts) this._addPoint(ev);
      this._drawLatest();
    });
    // Commit on both up and cancel: a cancelled stroke (e.g. an incoming
    // call) still happened on the page, so it counts as ink — including
    // single taps, which become dots (i, j, punctuation).
    const end = (e) => {
      if (!this.current || e.pointerId !== this.activeId) return;
      this._addPoint(e);
      if (this.current.points.length >= 1) this.strokes.push(this.current);
      this.current = null;
      this.activeId = null;
      this.activeType = null;
      this.redraw();
      if (this.onChange) this.onChange();
    };
    c.addEventListener("pointerup", end);
    c.addEventListener("pointercancel", end);
  }

  _pos(e) {
    const r = this.canvas.getBoundingClientRect();
    return {
      x: (e.clientX - r.left) * this.dpr,
      y: (e.clientY - r.top) * this.dpr,
      p: e.pressure && e.pressure > 0 ? e.pressure : 0.5,
    };
  }

  _addPoint(e) {
    const pt = this._pos(e);
    const pts = this.current.points;
    const last = pts[pts.length - 1];
    if (last && Math.hypot(pt.x - last.x, pt.y - last.y) < 1.2 * this.dpr) return;
    pts.push(pt);
  }

  _width(p) {
    // pressure 0..1 -> 1.2px .. 3.4px at dpr=1 scale
    return (1.1 + 2.6 * Math.min(1, Math.max(0, p))) * this.dpr;
  }

  _drawLatest() {
    const pts = this.current.points;
    const n = pts.length;
    if (n < 2) return;
    const { ctx } = this;
    ctx.strokeStyle = "#1b2340";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    // draw only the newest segment, smoothed against the previous point
    const a = pts[n - 3] || pts[n - 2];
    const b = pts[n - 2];
    const c = pts[n - 1];
    ctx.lineWidth = this._width((b.p + c.p) / 2);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.quadraticCurveTo(b.x, b.y, (b.x + c.x) / 2, (b.y + c.y) / 2);
    ctx.stroke();
  }

  redraw() {
    this._paintPaper();
    const { ctx } = this;
    ctx.strokeStyle = "#1b2340";
    ctx.fillStyle = "#1b2340";
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    for (const s of this.strokes) {
      const pts = s.points;
      if (pts.length === 1) {
        // tap: draw a dot so i/j punctuation stays visible
        ctx.beginPath();
        ctx.arc(pts[0].x, pts[0].y, this._width(pts[0].p) / 2, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }
      if (pts.length === 2) {
        ctx.beginPath();
        ctx.lineWidth = this._width((pts[0].p + pts[1].p) / 2);
        ctx.moveTo(pts[0].x, pts[0].y);
        ctx.lineTo(pts[1].x, pts[1].y);
        ctx.stroke();
        continue;
      }
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length - 1; i++) {
        ctx.lineWidth = this._width((pts[i].p + pts[i + 1].p) / 2);
        const mx = (pts[i].x + pts[i + 1].x) / 2;
        const my = (pts[i].y + pts[i + 1].y) / 2;
        ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(mx, my);
      }
      // final segment to the last point (the loop stops at its midpoint)
      const n = pts.length;
      ctx.lineWidth = this._width((pts[n - 2].p + pts[n - 1].p) / 2);
      ctx.lineTo(pts[n - 1].x, pts[n - 1].y);
      ctx.stroke();
    }
  }

  undo() { this.strokes.pop(); this.redraw(); if (this.onChange) this.onChange(); }
  clear() { this.strokes = []; this.current = null; this.activeId = null; this.activeType = null; this.redraw(); if (this.onChange) this.onChange(); }
  isEmpty() { return this.strokes.length === 0; }

  inkBBox() {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const s of this.strokes)
      for (const p of s.points) {
        if (p.x < x0) x0 = p.x; if (p.y < y0) y0 = p.y;
        if (p.x > x1) x1 = p.x; if (p.y > y1) y1 = p.y;
      }
    if (x0 === Infinity) return null;
    return { x0, y0, x1, y1 };
  }
}
