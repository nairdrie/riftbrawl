// ─────────────────────────────────────────────────────────────────────────────
// Body-part painter (designer). Opens a modal paint program scoped to ONE body
// part, with the vector default shown underneath as an onion-skin so you can
// paint right over it. The painted bitmap becomes that part's image (the same
// slot a PNG upload fills), sized to the runtime's image convention so it drops
// onto the rig aligned with the vector it replaces.
//
//   openPainter({ part, vector, existingSrc, palette, onSave })
//     vector     = getPartDraw(spec, part, colors)   // {kind,len,band|ref,render}
//     existingSrc= current images[part].src or null  // continue editing
//     palette    = { primary, secondary, accent }    // quick swatches
//     onSave(dataURL)                                 // called on Save
//
// Full tool suite: brush, eraser, line, rectangle, ellipse (outline/filled),
// bucket fill, eyedropper, mirror-X, color, thickness, opacity, undo/redo, clear,
// onion-skin toggle. Keyboard: B/E/L/R/O/G/I tools, [ ] size, M mirror,
// Ctrl+Z / Ctrl+Shift+Z undo·redo, Enter save, Esc cancel.
// ─────────────────────────────────────────────────────────────────────────────

const SS = 12;            // supersample: rig units → painter pixels
const MAXHIST = 40;

let styled = false;
function injectStyle() {
  if (styled) return; styled = true;
  const s = document.createElement('style');
  s.textContent = `
  #pntOv { position: fixed; inset: 0; z-index: 50; background: #060814ee; display: flex;
           align-items: center; justify-content: center; backdrop-filter: blur(4px); }
  #pntCard { background: #0a0d1d; border: 1px solid #26304f; border-radius: 12px; padding: 12px 14px;
             box-shadow: 0 24px 80px #000a; display: flex; flex-direction: column; gap: 10px; max-width: 94vw; max-height: 94vh; }
  #pntCard h3 { margin: 0; font: 600 14px system-ui; color: #eef2fb; }
  #pntCard h3 small { color: #8d99c2; font-weight: 400; margin-left: 8px; }
  #pntBody { display: flex; gap: 12px; }
  #pntTools { display: flex; flex-direction: column; gap: 4px; }
  .pntT { width: 40px; height: 36px; display: flex; align-items: center; justify-content: center; font-size: 17px;
          background: #131a33; border: 1px solid #2a3358; border-radius: 7px; color: #cdd8ec; cursor: pointer; }
  .pntT:hover { background: #1d264a; }
  .pntT.on { background: #2a6cff; border-color: #2a6cff; color: #fff; }
  #pntStage { position: relative; background:
      conic-gradient(#1a2138 25%, #141a2e 0 50%, #1a2138 0 75%, #141a2e 0) 0 0/18px 18px;
      border: 1px solid #2a3358; border-radius: 8px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
  #pntStage canvas { position: absolute; image-rendering: pixelated; }
  #pntCur { cursor: crosshair; }
  #pntSide { display: flex; flex-direction: column; gap: 10px; width: 180px; }
  #pntSide .grp { border: 1px solid #1d2342; border-radius: 8px; padding: 8px; }
  #pntSide label { display: block; font-size: 11px; color: #aeb9d8; margin: 0 0 3px; }
  #pntSide input[type=range] { width: 100%; }
  #pntSwatches { display: flex; flex-wrap: wrap; gap: 5px; margin-top: 6px; }
  .pntSw { width: 20px; height: 20px; border-radius: 5px; border: 1px solid #0006; cursor: pointer; box-shadow: 0 0 0 1px #2a3358; }
  .pntSw.on { box-shadow: 0 0 0 2px #fff; }
  #pntFoot { display: flex; gap: 8px; justify-content: flex-end; }
  #pntCard button.act { background: #1b2342; color: #cdd8ec; border: 1px solid #2c3c6a; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 12px; }
  #pntCard button.act:hover { background: #243056; }
  #pntCard button.go { background: #1f8a4c; border-color: #1f8a4c; color: #fff; }
  .pntChk { display: flex; align-items: center; gap: 6px; font-size: 11px; color: #aeb9d8; }
  .pntVal { font: 11px ui-monospace, monospace; color: #9fd0ff; float: right; }
  .pntHint { font-size: 10px; color: #5f6c92; }
  `;
  document.head.appendChild(s);
}

const hexToRgba = (hex, a) => {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), Math.round(a * 255)];
};

export function openPainter({ part, vector, existingSrc, palette, onSave }) {
  injectStyle();
  if (!vector) return;

  // canvas size from the part's image convention
  let W, H;
  if (vector.kind === 'bone') { W = Math.round(vector.len * SS); H = Math.round(vector.band * SS); }
  else { W = H = Math.round(vector.ref * SS); }
  W = Math.max(48, W); H = Math.max(48, H);

  // ── DOM ──
  const ov = document.createElement('div'); ov.id = 'pntOv';
  const card = document.createElement('div'); card.id = 'pntCard'; ov.appendChild(card);
  card.innerHTML = `
    <h3>Paint: ${part} <small>${W}×${H}px · paint over the vector underlay</small></h3>
    <div id="pntBody">
      <div id="pntTools"></div>
      <div id="pntStage"></div>
      <div id="pntSide">
        <div class="grp">
          <label>Color</label>
          <input type="color" id="pntColor" value="#cfd8ec" style="width:100%;height:30px;background:#11162c;border:1px solid #2c3c6a;border-radius:5px">
          <div id="pntSwatches"></div>
        </div>
        <div class="grp">
          <label>Size <span class="pntVal" id="pntSizeV">8</span></label>
          <input type="range" id="pntSize" min="1" max="64" step="1" value="8">
          <label style="margin-top:8px">Opacity <span class="pntVal" id="pntOpV">100%</span></label>
          <input type="range" id="pntOp" min="5" max="100" step="5" value="100">
          <label class="pntChk" style="margin-top:8px"><input type="checkbox" id="pntFill"> fill shapes</label>
          <label class="pntChk"><input type="checkbox" id="pntOnion" checked> onion-skin</label>
          <label class="pntChk"><input type="checkbox" id="pntMirror"> mirror X</label>
        </div>
        <div class="grp" style="display:flex;gap:6px;justify-content:space-between">
          <button class="act" id="pntUndo" title="Undo (Ctrl+Z)">↶</button>
          <button class="act" id="pntRedo" title="Redo (Ctrl+Shift+Z)">↷</button>
          <button class="act" id="pntClear" title="Clear">Clear</button>
        </div>
      </div>
    </div>
    <div id="pntFoot">
      <span class="pntHint" style="margin-right:auto">B brush · E eraser · L line · R rect · O oval · G fill · I pick · M mirror</span>
      <button class="act" id="pntCancel">Cancel</button>
      <button class="act go" id="pntSave">Save to part</button>
    </div>`;
  document.body.appendChild(ov);

  const $ = (id) => card.querySelector('#' + id);
  const stage = $('pntStage');
  // fit the stage within the modal while keeping aspect (CSS scale only)
  const fit = Math.min(1, 560 / W, 460 / H, (innerWidth * 0.5) / W, (innerHeight * 0.6) / H);
  const cssW = Math.round(W * fit), cssH = Math.round(H * fit);
  stage.style.width = cssW + 'px'; stage.style.height = cssH + 'px';

  const mk = (z) => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    cv.style.width = cssW + 'px'; cv.style.height = cssH + 'px'; cv.style.zIndex = z; stage.appendChild(cv); return cv; };
  const back = mk(0), paint = mk(1), prev = mk(2);   // backdrop · art · live preview
  back.style.pointerEvents = paint.style.pointerEvents = 'none';
  prev.id = 'pntCur';
  const bx = back.getContext('2d'), px = paint.getContext('2d'), vx = prev.getContext('2d');

  // ── vector backdrop (onion skin) ──
  function drawBackdrop() {
    bx.clearRect(0, 0, W, H); bx.save();
    if (vector.kind === 'bone') { bx.translate(0, H / 2); bx.scale(SS, SS); }
    else { bx.translate(W / 2, H / 2); bx.scale(SS, SS); }
    bx.lineCap = 'round'; bx.lineJoin = 'round';
    vector.render(bx); bx.restore();
  }
  drawBackdrop();
  back.style.opacity = '0.5';

  // ── load existing image into the paint layer (continue editing) ──
  if (existingSrc) { const im = new Image(); im.onload = () => { px.drawImage(im, 0, 0, W, H); pushHist(); }; im.crossOrigin = 'anonymous'; im.src = existingSrc; }

  // ── state ──
  let tool = 'brush', color = '#cfd8ec', size = 8, opacity = 1, fill = false, mirror = false;
  const swatches = [palette?.primary, palette?.secondary, palette?.accent, '#000000', '#ffffff'].filter(Boolean);
  let recent = [];

  // ── tools UI ──
  const TOOLS = [['brush', '✏️'], ['eraser', '🩹'], ['line', '／'], ['rect', '▭'], ['ellipse', '◯'], ['bucket', '🪣'], ['eyedropper', '💧']];
  const tbtn = {};
  for (const [t, icon] of TOOLS) {
    const b = document.createElement('div'); b.className = 'pntT'; b.textContent = icon; b.title = t;
    b.onclick = () => setTool(t); $('pntTools').appendChild(b); tbtn[t] = b;
  }
  function setTool(t) { tool = t; for (const k in tbtn) tbtn[k].classList.toggle('on', k === t); }
  setTool('brush');

  // swatches
  function renderSwatches() {
    const el = $('pntSwatches'); el.innerHTML = '';
    for (const c of [...swatches, ...recent]) {
      const sw = document.createElement('div'); sw.className = 'pntSw' + (c === color ? ' on' : '');
      sw.style.background = c; sw.title = c; sw.onclick = () => setColor(c); el.appendChild(sw);
    }
  }
  function setColor(c) { color = c; $('pntColor').value = c; renderSwatches(); }
  renderSwatches();

  $('pntColor').oninput = (e) => { color = e.target.value; renderSwatches(); };
  $('pntSize').oninput = (e) => { size = +e.target.value; $('pntSizeV').textContent = size; };
  $('pntOp').oninput = (e) => { opacity = +e.target.value / 100; $('pntOpV').textContent = e.target.value + '%'; };
  $('pntFill').onchange = (e) => fill = e.target.checked;
  $('pntOnion').onchange = (e) => back.style.display = e.target.checked ? '' : 'none';
  $('pntMirror').onchange = (e) => mirror = e.target.checked;

  // ── history ──
  const hist = []; let hidx = -1;
  function pushHist() { hist.splice(hidx + 1); hist.push(px.getImageData(0, 0, W, H)); if (hist.length > MAXHIST) hist.shift(); hidx = hist.length - 1; updHist(); }
  function restore(i) { if (i < 0 || i >= hist.length) return; hidx = i; px.putImageData(hist[i], 0, 0); updHist(); }
  function updHist() { $('pntUndo').disabled = hidx <= 0; $('pntRedo').disabled = hidx >= hist.length - 1; }
  pushHist();   // blank baseline
  $('pntUndo').onclick = () => restore(hidx - 1);
  $('pntRedo').onclick = () => restore(hidx + 1);
  $('pntClear').onclick = () => { px.clearRect(0, 0, W, H); pushHist(); };

  // ── drawing ──
  const pt = (e) => { const r = prev.getBoundingClientRect(); return { x: (e.clientX - r.left) * (W / r.width), y: (e.clientY - r.top) * (H / r.height) }; };
  const mirX = (x) => W - x;
  let drawing = false, start = null, lastPt = null;

  function strokeStyle(ctx) {
    ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.lineWidth = size;
    ctx.globalAlpha = opacity; ctx.strokeStyle = color; ctx.fillStyle = color;
    ctx.globalCompositeOperation = tool === 'eraser' ? 'destination-out' : 'source-over';
  }
  function seg(ctx, a, b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); if (mirror) { ctx.beginPath(); ctx.moveTo(mirX(a.x), a.y); ctx.lineTo(mirX(b.x), b.y); ctx.stroke(); } }
  function dot(ctx, p) { ctx.beginPath(); ctx.arc(p.x, p.y, size / 2, 0, Math.PI * 2); ctx.fill(); if (mirror) { ctx.beginPath(); ctx.arc(mirX(p.x), p.y, size / 2, 0, Math.PI * 2); ctx.fill(); } }

  function shape(ctx, a, b) {
    ctx.beginPath();
    if (tool === 'line') { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); if (mirror) { ctx.beginPath(); ctx.moveTo(mirX(a.x), a.y); ctx.lineTo(mirX(b.x), b.y); ctx.stroke(); } return; }
    const drawRect = (sx) => { const x = sx ? mirX(Math.max(a.x, b.x)) : Math.min(a.x, b.x); ctx.beginPath(); ctx.rect(x, Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); fill ? ctx.fill() : ctx.stroke(); };
    const drawEll = (sx) => { const cx = sx ? mirX((a.x + b.x) / 2) : (a.x + b.x) / 2; ctx.beginPath(); ctx.ellipse(cx, (a.y + b.y) / 2, Math.abs(b.x - a.x) / 2, Math.abs(b.y - a.y) / 2, 0, 0, Math.PI * 2); fill ? ctx.fill() : ctx.stroke(); };
    if (tool === 'rect') { drawRect(false); if (mirror) drawRect(true); }
    else if (tool === 'ellipse') { drawEll(false); if (mirror) drawEll(true); }
  }

  function eyedrop(p) {
    const tmp = document.createElement('canvas'); tmp.width = W; tmp.height = H; const tc = tmp.getContext('2d');
    if ($('pntOnion').checked) tc.drawImage(back, 0, 0);
    tc.drawImage(paint, 0, 0);
    const d = tc.getImageData(Math.max(0, Math.min(W - 1, p.x | 0)), Math.max(0, Math.min(H - 1, p.y | 0)), 1, 1).data;
    if (d[3] < 8) return;       // transparent — nothing to pick
    setColor('#' + [d[0], d[1], d[2]].map((v) => v.toString(16).padStart(2, '0')).join(''));
  }

  function floodFill(p) {
    const x0 = p.x | 0, y0 = p.y | 0; if (x0 < 0 || y0 < 0 || x0 >= W || y0 >= H) return;
    const img = px.getImageData(0, 0, W, H), d = img.data, tol = 32;
    const si = (y0 * W + x0) * 4;
    const tr = d[si], tg = d[si + 1], tb = d[si + 2], ta = d[si + 3];
    const [fr, fg, fb, fa] = hexToRgba(color, opacity); const a = fa / 255;
    if (Math.abs(fr - tr) <= 1 && Math.abs(fg - tg) <= 1 && Math.abs(fb - tb) <= 1 && Math.abs(fa - ta) <= 1) return;
    const at = (i) => Math.abs(d[i] - tr) <= tol && Math.abs(d[i + 1] - tg) <= tol && Math.abs(d[i + 2] - tb) <= tol && Math.abs(d[i + 3] - ta) <= tol;
    const set = (i) => { d[i] = fr * a + d[i] * (1 - a); d[i + 1] = fg * a + d[i + 1] * (1 - a); d[i + 2] = fb * a + d[i + 2] * (1 - a); d[i + 3] = fa + d[i + 3] * (1 - a); };
    const stack = [[x0, y0]];
    while (stack.length) {
      let [cx, cy] = stack.pop();
      while (cy >= 0 && at((cy * W + cx) * 4)) cy--; cy++;
      let lL = false, lR = false;
      while (cy < H && at((cy * W + cx) * 4)) {
        set((cy * W + cx) * 4);
        if (cx > 0) { const m = at((cy * W + cx - 1) * 4); if (m && !lL) { stack.push([cx - 1, cy]); lL = true; } else if (!m) lL = false; }
        if (cx < W - 1) { const m = at((cy * W + cx + 1) * 4); if (m && !lR) { stack.push([cx + 1, cy]); lR = true; } else if (!m) lR = false; }
        cy++;
      }
    }
    px.putImageData(img, 0, 0); pushHist();
  }

  prev.addEventListener('pointerdown', (e) => {
    prev.setPointerCapture(e.pointerId);
    const p = pt(e);
    if (tool === 'eyedropper') { eyedrop(p); return; }
    if (tool === 'bucket') { floodFill(p); return; }
    drawing = true; start = p; lastPt = p;
    if (tool === 'brush' || tool === 'eraser') { strokeStyle(px); dot(px, p); }
  });
  prev.addEventListener('pointermove', (e) => {
    if (!drawing) return; const p = pt(e);
    if (tool === 'brush' || tool === 'eraser') { strokeStyle(px); seg(px, lastPt, p); lastPt = p; }
    else { vx.clearRect(0, 0, W, H); strokeStyle(vx); shape(vx, start, p); }   // live preview
  });
  prev.addEventListener('pointerup', (e) => {
    if (!drawing) return; drawing = false; const p = pt(e);
    vx.clearRect(0, 0, W, H);
    if (tool === 'line' || tool === 'rect' || tool === 'ellipse') { strokeStyle(px); shape(px, start, p); }
    px.globalAlpha = 1; px.globalCompositeOperation = 'source-over';
    if (color && tool !== 'eraser') { recent = [color, ...recent.filter((c) => c !== color)].slice(0, 5); renderSwatches(); }
    pushHist();
  });

  // ── close / save ──
  function close() { ov.remove(); document.removeEventListener('keydown', onKey, true); }
  function save() {
    const url = paint.toDataURL('image/png');
    close(); onSave && onSave(url);
  }
  $('pntCancel').onclick = close;
  $('pntSave').onclick = save;
  ov.addEventListener('pointerdown', (e) => { if (e.target === ov) close(); });

  function onKey(e) {
    if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName) && e.target.type !== 'range') return;
    const k = e.key.toLowerCase();
    if (e.ctrlKey || e.metaKey) {
      if (k === 'z') { e.preventDefault(); e.shiftKey ? restore(hidx + 1) : restore(hidx - 1); return; }
      if (k === 'y') { e.preventDefault(); restore(hidx + 1); return; }
      return;
    }
    if (k === 'escape') { e.preventDefault(); close(); }
    else if (k === 'enter') { e.preventDefault(); save(); }
    else if (k === 'b') setTool('brush');
    else if (k === 'e') setTool('eraser');
    else if (k === 'l') setTool('line');
    else if (k === 'r') setTool('rect');
    else if (k === 'o') setTool('ellipse');
    else if (k === 'g') setTool('bucket');
    else if (k === 'i') setTool('eyedropper');
    else if (k === 'm') { mirror = !mirror; $('pntMirror').checked = mirror; }
    else if (k === '[') { size = Math.max(1, size - 2); $('pntSize').value = size; $('pntSizeV').textContent = size; }
    else if (k === ']') { size = Math.min(64, size + 2); $('pntSize').value = size; $('pntSizeV').textContent = size; }
  }
  document.addEventListener('keydown', onKey, true);
}
