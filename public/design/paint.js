// ─────────────────────────────────────────────────────────────────────────────
// Skin Forge — paint canvas. Draw a part's art in-browser with a brush/eraser;
// Apply exports a transparent PNG data URL that the caller uploads + binds to the
// slot through the exact same pipeline as an uploaded image — so painted art
// rides the animation too. An existing slot image opens as the starting layer.
// ─────────────────────────────────────────────────────────────────────────────

let modal, canvas, ctx, st = null;
const MAX_UNDO = 24;

function build() {
  if (modal) return;
  modal = document.createElement('div');
  modal.className = 'paint-modal';
  modal.hidden = true;
  modal.innerHTML = `
    <div class="paint-card">
      <div class="paint-head">
        <span class="paint-title">Paint</span>
        <div class="paint-tools">
          <input type="color" class="p-color" value="#ffd23f" title="Brush colour">
          <button type="button" class="p-tool p-brush active" title="Brush">✎ Brush</button>
          <button type="button" class="p-tool p-eraser" title="Eraser">⌫ Erase</button>
          <label class="p-range">Size <input type="range" class="p-size" min="1" max="160" value="16"></label>
          <button type="button" class="p-tool p-undo" title="Undo (Ctrl+Z)">↶ Undo</button>
          <button type="button" class="p-tool p-clear" title="Clear the canvas">Clear</button>
        </div>
        <div class="paint-actions">
          <button type="button" class="btn ghost p-cancel">Cancel</button>
          <button type="button" class="btn primary p-apply">Apply</button>
        </div>
      </div>
      <div class="paint-stage"><canvas class="paint-canvas" width="512" height="512"></canvas></div>
      <div class="paint-hint">Transparent areas stay see-through. Apply binds this art to the part — then nudge its position &amp; scale with the sliders.</div>
    </div>`;
  document.body.appendChild(modal);
  canvas = modal.querySelector('.paint-canvas');
  ctx = canvas.getContext('2d');
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const q = (s) => modal.querySelector(s);
  q('.p-color').addEventListener('input', (e) => { st.color = e.target.value; });
  q('.p-size').addEventListener('input', (e) => { st.size = Number(e.target.value); });
  q('.p-brush').addEventListener('click', () => setTool('brush'));
  q('.p-eraser').addEventListener('click', () => setTool('eraser'));
  q('.p-undo').addEventListener('click', undo);
  q('.p-clear').addEventListener('click', () => { pushUndo(); ctx.clearRect(0, 0, canvas.width, canvas.height); });
  q('.p-cancel').addEventListener('click', close);
  q('.p-apply').addEventListener('click', apply);
  // click the dimmed backdrop (but not the card) to dismiss
  modal.addEventListener('pointerdown', (e) => { if (e.target === modal) close(); });
  document.addEventListener('keydown', (e) => {
    if (modal.hidden) return;
    if (e.key === 'Escape') close();
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); undo(); }
  });

  wireDrawing();
}

function setTool(tool) {
  st.tool = tool;
  modal.querySelector('.p-brush').classList.toggle('active', tool === 'brush');
  modal.querySelector('.p-eraser').classList.toggle('active', tool === 'eraser');
}

function pushUndo() {
  try {
    st.undo.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (st.undo.length > MAX_UNDO) st.undo.shift();
  } catch { /* canvas tainted — shouldn't happen with same-origin images */ }
}
function undo() {
  const img = st.undo.pop();
  if (img) ctx.putImageData(img, 0, 0);
}

function posOf(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) / r.width * canvas.width,
    y: (e.clientY - r.top) / r.height * canvas.height,
  };
}

function dab(x0, y0, x1, y1) {
  ctx.globalCompositeOperation = st.tool === 'eraser' ? 'destination-out' : 'source-over';
  ctx.strokeStyle = st.color;
  ctx.fillStyle = st.color;
  ctx.lineWidth = st.size;
  ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
  ctx.beginPath(); ctx.arc(x1, y1, st.size / 2, 0, Math.PI * 2); ctx.fill();
}

function wireDrawing() {
  canvas.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    pushUndo();
    st.drawing = true;
    const p = posOf(e);
    st.lastX = p.x; st.lastY = p.y;
    dab(p.x, p.y, p.x, p.y);
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!st.drawing) return;
    e.preventDefault();
    const p = posOf(e);
    dab(st.lastX, st.lastY, p.x, p.y);
    st.lastX = p.x; st.lastY = p.y;
  });
  const end = (e) => {
    if (!st.drawing) return;
    st.drawing = false;
    try { canvas.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
  };
  canvas.addEventListener('pointerup', end);
  canvas.addEventListener('pointercancel', end);
}

function close() {
  if (!modal) return;
  modal.hidden = true;
  if (st) st.drawing = false;
}

function apply() {
  const dataUrl = canvas.toDataURL('image/png');
  const cb = st.onApply;
  close();
  if (cb) cb(dataUrl);
}

// openPaint({ title, startUrl, color, onApply }) — onApply(dataUrl) fires on Apply.
export function openPaint({ title, startUrl, color, onApply } = {}) {
  build();
  st = { color: color || '#ffd23f', size: 16, tool: 'brush', drawing: false, lastX: 0, lastY: 0, undo: [], onApply };
  modal.querySelector('.paint-title').textContent = title || 'Paint';
  modal.querySelector('.p-color').value = st.color;
  modal.querySelector('.p-size').value = String(st.size);
  setTool('brush');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  modal.hidden = false;
  if (startUrl) {
    const img = new Image();
    img.onload = () => {
      const s = Math.min(canvas.width / img.naturalWidth, canvas.height / img.naturalHeight);
      const w = img.naturalWidth * s, h = img.naturalHeight * s;
      ctx.drawImage(img, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
    };
    img.src = startUrl;
  }
}
