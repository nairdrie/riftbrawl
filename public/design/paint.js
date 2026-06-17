// ─────────────────────────────────────────────────────────────────────────────
// Skin Forge — paint editor. A small layered paint app for a single part slot:
//   • reference layer  — a faint "ghost" of the original part, positioned exactly
//     where the decal overlays it (rendered by the caller via `reference`)
//   • art layer        — the editable pixels (exported as a transparent PNG)
//   • overlay layer    — transient shape previews, selection marquee, floating paste
// Tools: brush, eraser, line, rectangle, ellipse, eyedropper, rect-select, lasso,
// move. Shift constrains (straight/45° line, square, circle). Copy/Cut/Paste move
// selections. Apply exports a PNG data URL through the same upload→bind pipeline.
// ─────────────────────────────────────────────────────────────────────────────

const SIZE = 512;
const MAX_UNDO = 30;

let modal, refC, artC, ovC, rctx, ctx, octx, st = null;
let clipboard = null;     // { canvas } — survives across opens

function build() {
  if (modal) return;
  modal = document.createElement('div');
  modal.className = 'paint-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="paint-card">
      <div class="paint-head">
        <span class="paint-title">Paint</span>
        <div class="paint-actions">
          <label class="p-chk"><input type="checkbox" class="p-ref" checked> Reference</label>
          <button type="button" class="btn ghost p-cancel">Cancel</button>
          <button type="button" class="btn primary p-apply">Apply</button>
        </div>
      </div>
      <div class="paint-body">
        <div class="paint-toolbar">
          <input type="color" class="p-color" value="#ffd23f" title="Colour">
          <label class="p-range" title="Brush / line / shape size">◍ <input type="range" class="p-size" min="1" max="160" value="16"></label>
          <label class="p-chk" title="Fill shapes (off = outline)"><input type="checkbox" class="p-fill" checked> Fill</label>
          <span class="p-sep"></span>
          <button type="button" class="p-tool" data-tool="brush" title="Brush — Shift+click draws a straight line from the last point">Brush</button>
          <button type="button" class="p-tool" data-tool="line" title="Line — hold Shift to snap to 45°">Line</button>
          <button type="button" class="p-tool" data-tool="rect" title="Rectangle — hold Shift for a square">Rect</button>
          <button type="button" class="p-tool" data-tool="ellipse" title="Ellipse — hold Shift for a circle">Oval</button>
          <button type="button" class="p-tool" data-tool="eyedropper" title="Eyedropper — pick a colour (samples the reference too)">Pick</button>
          <button type="button" class="p-tool" data-tool="select" title="Rectangle select">Select</button>
          <button type="button" class="p-tool" data-tool="lasso" title="Lasso select">Lasso</button>
          <button type="button" class="p-tool" data-tool="move" title="Move the selection">Move</button>
          <button type="button" class="p-tool" data-tool="eraser" title="Eraser">Erase</button>
          <span class="p-sep"></span>
          <button type="button" class="p-act p-undo" title="Undo (Ctrl+Z)">↶</button>
          <button type="button" class="p-act p-redo" title="Redo (Ctrl+Shift+Z)">↷</button>
          <button type="button" class="p-act p-clear" title="Clear the canvas">Clear</button>
        </div>
        <div class="paint-stage">
          <canvas class="paint-ref" width="${SIZE}" height="${SIZE}"></canvas>
          <canvas class="paint-canvas" width="${SIZE}" height="${SIZE}"></canvas>
          <canvas class="paint-overlay" width="${SIZE}" height="${SIZE}"></canvas>
        </div>
      </div>
      <div class="paint-hint">Reference shows the built-in part where your art will land. Transparent areas stay see-through · Ctrl+C/X/V copy·cut·paste a selection · Enter commits a paste.</div>
    </div>`;
  document.body.appendChild(modal);
  refC = modal.querySelector('.paint-ref'); rctx = refC.getContext('2d');
  artC = modal.querySelector('.paint-canvas'); ctx = artC.getContext('2d', { willReadFrequently: true });
  ovC = modal.querySelector('.paint-overlay'); octx = ovC.getContext('2d');
  ctx.lineJoin = ctx.lineCap = 'round';

  const q = (s) => modal.querySelector(s);
  q('.p-color').addEventListener('input', (e) => { st.color = e.target.value; });
  q('.p-size').addEventListener('input', (e) => { st.size = Number(e.target.value); });
  q('.p-fill').addEventListener('change', (e) => { st.fill = e.target.checked; });
  q('.p-ref').addEventListener('change', (e) => { refC.style.display = e.target.checked ? '' : 'none'; });
  modal.querySelectorAll('.p-tool').forEach(b => b.addEventListener('click', () => setTool(b.dataset.tool)));
  q('.p-undo').addEventListener('click', undo);
  q('.p-redo').addEventListener('click', redo);
  q('.p-clear').addEventListener('click', () => { commitFloating(); pushUndo(); ctx.clearRect(0, 0, SIZE, SIZE); clearSelection(); });
  q('.p-cancel').addEventListener('click', close);
  q('.p-apply').addEventListener('click', apply);
  modal.addEventListener('pointerdown', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', onKey);
  wireDrawing();
}

// ── tools / state ─────────────────────────────────────────────────────────────

function setTool(tool) {
  if (st.tool === 'move' || st.floating) commitFloating();   // leaving move commits a paste
  st.tool = tool;
  modal.querySelectorAll('.p-tool').forEach(b => b.classList.toggle('active', b.dataset.tool === tool));
  ovC.style.cursor = tool === 'move' ? 'move' : tool === 'eyedropper' ? 'crosshair' : 'crosshair';
}

function pushUndo() {
  try {
    st.undo.push(ctx.getImageData(0, 0, SIZE, SIZE));
    if (st.undo.length > MAX_UNDO) st.undo.shift();
    st.redo.length = 0;
  } catch { /* ignore */ }
}
function undo() {
  if (!st.undo.length) return;
  commitFloating();
  st.redo.push(ctx.getImageData(0, 0, SIZE, SIZE));
  ctx.putImageData(st.undo.pop(), 0, 0);
  clearSelection();
}
function redo() {
  if (!st.redo.length) return;
  st.undo.push(ctx.getImageData(0, 0, SIZE, SIZE));
  ctx.putImageData(st.redo.pop(), 0, 0);
  clearSelection();
}

function onKey(e) {
  if (modal.hidden) return;
  const k = e.key.toLowerCase();
  if (e.key === 'Escape') { if (st.floating) { discardFloating(); } else close(); }
  else if ((e.ctrlKey || e.metaKey) && k === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
  else if ((e.ctrlKey || e.metaKey) && k === 'c') { e.preventDefault(); copySelection(false); }
  else if ((e.ctrlKey || e.metaKey) && k === 'x') { e.preventDefault(); copySelection(true); }
  else if ((e.ctrlKey || e.metaKey) && k === 'v') { e.preventDefault(); paste(); }
  else if (e.key === 'Enter') { e.preventDefault(); commitFloating(); }
}

// ── geometry helpers ────────────────────────────────────────────────────────

function posOf(e) {
  const r = ovC.getBoundingClientRect();
  return {
    x: Math.max(0, Math.min(SIZE, (e.clientX - r.left) / r.width * SIZE)),
    y: Math.max(0, Math.min(SIZE, (e.clientY - r.top) / r.height * SIZE)),
  };
}
// snap (x1,y1) relative to (x0,y0) to 45° increments
function snap45(x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4);
  const len = Math.hypot(dx, dy);
  return { x: x0 + Math.cos(a) * len, y: y0 + Math.sin(a) * len };
}
function addPath(c, sel) {
  c.beginPath();
  if (sel.kind === 'rect') {
    c.rect(sel.x, sel.y, sel.w, sel.h);
  } else {
    const p = sel.pts;
    if (!p.length) return;
    c.moveTo(p[0].x, p[0].y);
    for (let i = 1; i < p.length; i++) c.lineTo(p[i].x, p[i].y);
    c.closePath();
  }
}
function selBBox(sel) {
  if (sel.kind === 'rect') {
    return { x: Math.min(sel.x, sel.x + sel.w), y: Math.min(sel.y, sel.y + sel.h), w: Math.abs(sel.w), h: Math.abs(sel.h) };
  }
  let minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  for (const pt of sel.pts) { minX = Math.min(minX, pt.x); minY = Math.min(minY, pt.y); maxX = Math.max(maxX, pt.x); maxY = Math.max(maxY, pt.y); }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ── drawing primitives on the art layer ──────────────────────────────────────

function brushTo(x0, y0, x1, y1, erase) {
  ctx.globalCompositeOperation = erase ? 'destination-out' : 'source-over';
  ctx.strokeStyle = st.color; ctx.fillStyle = st.color; ctx.lineWidth = st.size;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.beginPath(); ctx.arc(x1, y1, st.size / 2, 0, Math.PI * 2); ctx.fill();
  ctx.globalCompositeOperation = 'source-over';
}
function shapeOn(c, tool, x0, y0, x1, y1, fill) {
  c.strokeStyle = st.color; c.fillStyle = st.color; c.lineWidth = st.size;
  c.lineJoin = c.lineCap = 'round';
  if (tool === 'line') {
    c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
  } else if (tool === 'rect') {
    const x = Math.min(x0, x1), y = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
    if (fill) c.fillRect(x, y, w, h); else c.strokeRect(x, y, w, h);
  } else if (tool === 'ellipse') {
    c.beginPath(); c.ellipse((x0 + x1) / 2, (y0 + y1) / 2, Math.abs(x1 - x0) / 2, Math.abs(y1 - y0) / 2, 0, 0, Math.PI * 2);
    if (fill) c.fill(); else c.stroke();
  }
}

// ── selection / clipboard / floating ──────────────────────────────────────────

function clearSelection() { st.selection = null; redrawOverlay(); }

function redrawOverlay() {
  octx.clearRect(0, 0, SIZE, SIZE);
  if (st.floating) {
    octx.drawImage(st.floating.canvas, st.floating.x, st.floating.y);
  }
  if (st.selection) {
    octx.save();
    octx.setLineDash([6, 4]); octx.lineWidth = 1.5; octx.strokeStyle = '#000'; addPath(octx, st.selection); octx.stroke();
    octx.setLineDash([6, 4]); octx.lineDashOffset = 6; octx.lineWidth = 1; octx.strokeStyle = '#fff'; addPath(octx, st.selection); octx.stroke();
    octx.restore();
  }
}

function extractSelection() {
  const b = selBBox(st.selection);
  if (b.w < 1 || b.h < 1) return null;
  const c = document.createElement('canvas'); c.width = Math.ceil(b.w); c.height = Math.ceil(b.h);
  const cx = c.getContext('2d');
  cx.save(); cx.translate(-b.x, -b.y); addPath(cx, st.selection); cx.clip();
  cx.drawImage(artC, 0, 0); cx.restore();
  return { canvas: c, x: b.x, y: b.y };
}
function eraseSelection() {
  ctx.save(); addPath(ctx, st.selection); ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = '#000'; ctx.fill(); ctx.restore();
  ctx.globalCompositeOperation = 'source-over';
}
function copySelection(cut) {
  if (!st.selection) return;
  const ex = extractSelection();
  if (!ex) return;
  clipboard = ex.canvas;
  if (cut) { pushUndo(); eraseSelection(); }
}
function paste() {
  if (!clipboard) return;
  commitFloating();
  const c = document.createElement('canvas'); c.width = clipboard.width; c.height = clipboard.height;
  c.getContext('2d').drawImage(clipboard, 0, 0);
  st.floating = { canvas: c, x: (SIZE - c.width) / 2, y: (SIZE - c.height) / 2 };
  setTool('move');
  redrawOverlay();
}
function commitFloating() {
  if (!st.floating) return;
  pushUndo();
  ctx.drawImage(st.floating.canvas, st.floating.x, st.floating.y);
  st.floating = null;
  redrawOverlay();
}
function discardFloating() { st.floating = null; redrawOverlay(); }

function sampleColor(x, y) {
  const px = Math.max(0, Math.min(SIZE - 1, Math.round(x))), py = Math.max(0, Math.min(SIZE - 1, Math.round(y)));
  let d = ctx.getImageData(px, py, 1, 1).data;
  if (d[3] < 8) { try { d = rctx.getImageData(px, py, 1, 1).data; } catch { /* tainted ref → skip */ } }
  if (d[3] < 8) return null;
  const h = (v) => v.toString(16).padStart(2, '0');
  return `#${h(d[0])}${h(d[1])}${h(d[2])}`;
}

// ── pointer handling ──────────────────────────────────────────────────────────

function wireDrawing() {
  ovC.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { ovC.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    const p = posOf(e);
    st.startX = p.x; st.startY = p.y; st.lastX = p.x; st.lastY = p.y; st.active = true;

    switch (st.tool) {
      case 'eyedropper': {
        const c = sampleColor(p.x, p.y);
        if (c) { st.color = c; modal.querySelector('.p-color').value = c; }
        st.active = false; break;
      }
      case 'brush': case 'eraser': {
        pushUndo();
        if (st.tool === 'brush' && e.shiftKey && st.lastCommit) {
          brushTo(st.lastCommit.x, st.lastCommit.y, p.x, p.y, false);
          st.lastCommit = { x: p.x, y: p.y }; st.active = false;
        } else {
          brushTo(p.x, p.y, p.x, p.y, st.tool === 'eraser');
        }
        break;
      }
      case 'line': case 'rect': case 'ellipse':
        pushUndo(); break;
      case 'select': case 'lasso':
        st.selection = st.tool === 'select' ? { kind: 'rect', x: p.x, y: p.y, w: 0, h: 0 } : { kind: 'lasso', pts: [{ x: p.x, y: p.y }] };
        break;
      case 'move':
        if (st.floating) {
          st.grab = { dx: p.x - st.floating.x, dy: p.y - st.floating.y };
        } else if (st.selection) {
          const ex = extractSelection();
          if (ex) { pushUndo(); eraseSelection(); st.floating = { canvas: ex.canvas, x: ex.x, y: ex.y }; st.grab = { dx: p.x - ex.x, dy: p.y - ex.y }; }
        }
        redrawOverlay(); break;
    }
  });

  ovC.addEventListener('pointermove', (e) => {
    if (!st.active && !(st.tool === 'move' && st.floating && st.grab)) return;
    e.preventDefault();
    let p = posOf(e);

    switch (st.tool) {
      case 'brush': brushTo(st.lastX, st.lastY, p.x, p.y, false); st.lastX = p.x; st.lastY = p.y; break;
      case 'eraser': brushTo(st.lastX, st.lastY, p.x, p.y, true); st.lastX = p.x; st.lastY = p.y; break;
      case 'line': case 'rect': case 'ellipse': {
        if (e.shiftKey) {
          if (st.tool === 'line') p = snap45(st.startX, st.startY, p.x, p.y);
          else { const s = Math.max(Math.abs(p.x - st.startX), Math.abs(p.y - st.startY)); p = { x: st.startX + Math.sign(p.x - st.startX) * s, y: st.startY + Math.sign(p.y - st.startY) * s }; }
        }
        redrawOverlay(); shapeOn(octx, st.tool, st.startX, st.startY, p.x, p.y, st.fill); st.lastX = p.x; st.lastY = p.y; break;
      }
      case 'select': st.selection.w = p.x - st.selection.x; st.selection.h = p.y - st.selection.y; redrawOverlay(); break;
      case 'lasso': st.selection.pts.push({ x: p.x, y: p.y }); redrawOverlay(); break;
      case 'move': if (st.floating && st.grab) { st.floating.x = p.x - st.grab.dx; st.floating.y = p.y - st.grab.dy; redrawOverlay(); } break;
    }
  });

  const end = (e) => {
    if (!st.active && !st.grab) return;
    const wasActive = st.active; st.active = false; const grab = st.grab; st.grab = null;
    try { ovC.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
    if (!wasActive && !grab) return;
    if (st.tool === 'brush') st.lastCommit = { x: st.lastX, y: st.lastY };
    if (st.tool === 'line' || st.tool === 'rect' || st.tool === 'ellipse') {
      shapeOn(ctx, st.tool, st.startX, st.startY, st.lastX, st.lastY, st.fill);
      octx.clearRect(0, 0, SIZE, SIZE); redrawOverlay();
    }
    if (st.tool === 'select' && st.selection && (Math.abs(st.selection.w) < 2 || Math.abs(st.selection.h) < 2)) clearSelection();
    if (st.tool === 'lasso' && st.selection && st.selection.pts.length < 3) clearSelection();
  };
  ovC.addEventListener('pointerup', end);
  ovC.addEventListener('pointercancel', end);
}

// ── lifecycle ─────────────────────────────────────────────────────────────────

function close() { if (modal) { modal.hidden = true; if (st) st.active = false; } }

function apply() {
  commitFloating();
  const dataUrl = artC.toDataURL('image/png');
  const cb = st.onApply;
  close();
  if (cb) cb(dataUrl);
}

// openPaint({ title, startUrl, color, reference, onApply })
//   reference(refCtx) — optional; paints the faint part backdrop.
//   onApply(dataUrl)  — fires on Apply with the exported PNG.
export function openPaint({ title, startUrl, color, reference, onApply } = {}) {
  build();
  st = {
    color: color || '#ffd23f', size: 16, fill: true, tool: 'brush',
    active: false, startX: 0, startY: 0, lastX: 0, lastY: 0, lastCommit: null, grab: null,
    selection: null, floating: null, undo: [], redo: [], onApply,
  };
  modal.querySelector('.paint-title').textContent = title || 'Paint';
  modal.querySelector('.p-color').value = st.color;
  modal.querySelector('.p-size').value = String(st.size);
  modal.querySelector('.p-fill').checked = true;
  modal.querySelector('.p-ref').checked = true; refC.style.display = '';
  setTool('brush');
  ctx.clearRect(0, 0, SIZE, SIZE);
  octx.clearRect(0, 0, SIZE, SIZE);
  rctx.clearRect(0, 0, SIZE, SIZE);
  modal.hidden = false;

  if (reference) { try { reference(rctx); } catch (e) { console.error('[paint] reference failed:', e); } }
  if (startUrl) {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(SIZE / img.naturalWidth, SIZE / img.naturalHeight);
      const w = img.naturalWidth * s, h = img.naturalHeight * s;
      ctx.drawImage(img, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
    };
    img.src = startUrl;
  }
}
