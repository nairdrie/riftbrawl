// ─────────────────────────────────────────────────────────────────────────────
// Client skin cache. Loads the global skins document (palette overrides + per-part
// image bindings) that the renderer applies in drawFighter — so reskins show up in
// char-select AND every live match with no netcode involvement. The /design editor
// reuses this module, layering an unsaved "preview" override on top for live WYSIWYG.
// ─────────────────────────────────────────────────────────────────────────────

export const COLOR_KEYS = ['primary', 'secondary', 'accent', 'glow', 'trail'];

// Every paintable slot + a human label. `hide` = the rig can drop its own art for
// that part so an uploaded image fully replaces it (vs. just overlaying on top).
export const SLOT_DEFS = [
  { id: 'root', label: 'Whole body', hide: true, hint: 'Replaces the entire fighter with one image (rides body bob/squash, but loses per-limb animation).' },
  { id: 'head', label: 'Head', hide: true },
  { id: 'torso', label: 'Torso', hide: false },
  { id: 'frontHand', label: 'Front hand', hide: true },
  { id: 'backHand', label: 'Back hand', hide: true },
  { id: 'weapon', label: 'Weapon / focus', hide: true },
  { id: 'frontFoot', label: 'Front foot', hide: false },
  { id: 'backFoot', label: 'Back foot', hide: false },
];

// Slots each rig actually exposes anchors for (Nova has a wisp tail, not legs).
export const CHAR_SLOTS = {
  aegis: ['root', 'head', 'torso', 'frontHand', 'backHand', 'weapon', 'frontFoot', 'backFoot'],
  volt: ['root', 'head', 'torso', 'frontHand', 'backHand', 'weapon', 'frontFoot', 'backFoot'],
  ember: ['root', 'head', 'torso', 'frontHand', 'backHand', 'weapon', 'frontFoot', 'backFoot'],
  tide: ['root', 'head', 'torso', 'frontHand', 'backHand', 'weapon', 'frontFoot', 'backFoot'],
  nova: ['root', 'head', 'torso', 'frontHand', 'backHand', 'weapon'],
};

const DEG2RAD = Math.PI / 180;

let DATA = { version: 1, updated: 0, skins: {} };   // raw doc from the server
const preview = {};                                 // charId -> raw char-skin (unsaved editor state)
const imgCache = new Map();                          // url -> HTMLImageElement
const renderCache = new Map();                       // charId -> resolved render skin | null
let onChange = null;

function loadImage(url) {
  let img = imgCache.get(url);
  if (!img) {
    img = new Image();
    img.onload = () => { renderCache.clear(); if (onChange) onChange(); };
    img.onerror = () => { /* leave incomplete → decal() skips it */ };
    img.src = url;
    imgCache.set(url, img);
  }
  return img;
}

function rawSkin(charId) {
  if (Object.prototype.hasOwnProperty.call(preview, charId)) return preview[charId];
  return DATA.skins?.[charId] || null;
}

// Resolve a char's raw skin into render-ready form: merged-in HTMLImageElements +
// radians. Cached until the doc, preview, or an image-load invalidates it.
export function getRenderSkin(charId) {
  if (renderCache.has(charId)) return renderCache.get(charId);
  const raw = rawSkin(charId);
  let out = null;
  if (raw && (raw.colors || raw.slots)) {
    out = { colors: raw.colors || null, slots: {} };
    const slots = raw.slots || {};
    for (const name of Object.keys(slots)) {
      const d = slots[name];
      if (!d || !d.img) continue;
      out.slots[name] = {
        img: loadImage(d.img),
        x: d.x || 0,
        y: d.y || 0,
        scale: d.scale ?? 1,
        rot: (d.rot || 0) * DEG2RAD,
        opacity: d.opacity ?? 1,
        flip: !!d.flip,
        hideBase: !!d.hideBase,
      };
    }
  }
  renderCache.set(charId, out);
  return out;
}

export async function loadSkins() {
  try {
    const res = await fetch('/api/skins', { cache: 'no-store' });
    if (res.ok) {
      DATA = await res.json();
      renderCache.clear();
      if (onChange) onChange();
    }
  } catch { /* offline / not yet up — fighters render with built-in art */ }
  return DATA;
}

export function getSkinsDoc() { return DATA; }
export function setSkinsDoc(doc) { DATA = doc || { version: 1, updated: 0, skins: {} }; renderCache.clear(); if (onChange) onChange(); }

// editor live-preview: layer an unsaved char-skin over the loaded doc
export function setPreviewSkin(charId, rawCharSkin) {
  if (rawCharSkin) preview[charId] = rawCharSkin;
  else delete preview[charId];
  renderCache.delete(charId);
  if (onChange) onChange();
}
export function clearPreview(charId) {
  if (charId) delete preview[charId]; else for (const k of Object.keys(preview)) delete preview[k];
  renderCache.delete(charId);
  if (onChange) onChange();
}

export function setOnChange(fn) { onChange = fn; }
