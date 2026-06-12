// ─────────────────────────────────────────────────────────────────────────────
// App shell: screen routing, auth, friends/invites, character select, results.
// ─────────────────────────────────────────────────────────────────────────────

import { net } from './net.js';
import { sfx, toggleMute, isMuted, setSfxVolume, getSfxVolume } from './sfx.js';
import { playMusic, setMusicVolume, getMusicVolume } from './music.js';
import { MatchClient } from './game.js';
import { Renderer } from './renderer.js';
import { drawPortrait } from './fighters.js';
import { CHARACTERS, CHARACTER_LIST } from '/shared/characters.js';
import { padConnected, samplePadMenu, getSwapAB, setSwapAB } from './input.js';

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

let me = null;                // {uid, username, wins, losses}
let renderer = null;
let match = null;             // MatchClient
let room = null;              // latest room lobby msg
let selectedChar = localStorage.getItem('smash_char') || 'tide';
let readySent = false;
let lastResults = null;

// ── screens ─────────────────────────────────────────────────────────────────

function show(id) {
  $$('.screen').forEach(s => s.classList.toggle('active', s.id === id));
  document.body.dataset.screen = id;
  // Match track for live fights, the overture everywhere else.
  playMusic(id === 'screen-game' ? 'match' : 'overture');
}

function toast(msg, kind = 'ok') {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = msg;
  $('#toasts').appendChild(el);
  if (kind === 'error') sfx.error(); else sfx.ok();
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3000);
}

// ── auth ────────────────────────────────────────────────────────────────────

let authMode = 'login';

function setAuthMode(mode) {
  authMode = mode;
  $$('#auth-tabs button').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  $('#auth-submit').textContent = mode === 'login' ? 'ENTER THE ARENA' : 'CREATE FIGHTER';
  $('#auth-error').textContent = '';
}

$$('#auth-tabs button').forEach(b => b.addEventListener('click', () => { sfx.click(); setAuthMode(b.dataset.mode); }));

$('#auth-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const username = $('#auth-username').value.trim();
  const password = $('#auth-password').value;
  if (!username || !password) return;
  $('#auth-submit').disabled = true;
  net.send({ t: authMode, username, password });
});

net.on('auth', (msg) => {
  $('#auth-submit').disabled = false;
  if (!msg.ok) {
    if ($('#screen-auth').classList.contains('active')) {
      $('#auth-error').textContent = msg.error || 'Authentication failed';
    }
    localStorage.removeItem('smash_token');
    show('screen-auth');
    return;
  }
  localStorage.setItem('smash_token', msg.token);
  me = msg.user;
  updateUserChip();
  if (!match && !room) show('screen-menu');
  sfx.ok();
});

let replaced = false; // signed in from another tab — stop auto-resuming

net.on('_open', () => {
  const token = localStorage.getItem('smash_token');
  if (token && !replaced) net.send({ t: 'resume', token });
  else show('screen-auth');
  $('#conn-banner').classList.remove('visible');
});

net.on('error', (msg) => {
  if (msg.code === 'replaced') {
    replaced = true;
    me = null;
    if (match) { match.stop(); match = null; }
    room = null;
    show('screen-auth');
    $('#auth-error').textContent = 'Signed in from another tab';
  }
});

net.on('_close', () => {
  if (me) $('#conn-banner').classList.add('visible');
  if (match && !match.over) match.connectionLost();
});

$('#btn-logout').addEventListener('click', () => {
  localStorage.removeItem('smash_token');
  location.reload();
});

function updateUserChip() {
  if (!me) return;
  $('#user-tag').textContent = me.username;
  $('#user-record').textContent = `${me.wins ?? 0}W — ${me.losses ?? 0}L`;
}

// ── friends / social ────────────────────────────────────────────────────────

net.on('social', (msg) => {
  me = { ...me, ...msg.me };
  updateUserChip();

  const list = $('#friends-list');
  list.innerHTML = '';
  if (!msg.friends.length) {
    list.innerHTML = `<div class="empty-note">No fighters yet.<br>Add a friend by their tag.</div>`;
  }
  for (const f of msg.friends) {
    const li = document.createElement('div');
    li.className = 'friend';
    const canInvite = f.online && f.status === 'online';
    li.innerHTML = `
      <span class="dot ${f.online ? 'on' : ''}"></span>
      <div class="f-info">
        <div class="f-name">${esc(f.username)}</div>
        <div class="f-status">${f.online ? esc(f.status) : 'offline'} · ${f.wins}W ${f.losses}L</div>
      </div>
      <button class="btn-mini invite" ${canInvite ? '' : 'disabled'}>DUEL</button>
      <button class="btn-mini ghost remove" title="Remove">✕</button>`;
    li.querySelector('.invite').addEventListener('click', () => {
      sfx.click();
      net.send({ t: 'invite', uid: f.uid });
    });
    li.querySelector('.remove').addEventListener('click', () => {
      sfx.click();
      confirmAction(`Remove ${f.username} from your fighters?`, () => {
        net.send({ t: 'removeFriend', uid: f.uid });
      });
    });
    list.appendChild(li);
  }

  const reqBlock = $('#requests-block');
  const reqList = $('#requests-list');
  reqList.innerHTML = '';
  reqBlock.style.display = msg.requests.length ? '' : 'none';
  for (const r of msg.requests) {
    const li = document.createElement('div');
    li.className = 'friend request';
    li.innerHTML = `
      <div class="f-info"><div class="f-name">${esc(r.username)}</div>
      <div class="f-status">wants to be friends</div></div>
      <button class="btn-mini accept">✓</button>
      <button class="btn-mini ghost decline">✕</button>`;
    li.querySelector('.accept').addEventListener('click', () => { sfx.ok(); net.send({ t: 'acceptFriend', uid: r.uid }); });
    li.querySelector('.decline').addEventListener('click', () => { sfx.click(); net.send({ t: 'declineFriend', uid: r.uid }); });
    reqList.appendChild(li);
  }
});

$('#add-friend-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const v = $('#friend-input').value.trim();
  if (!v) return;
  net.send({ t: 'addFriend', username: v });
  $('#friend-input').value = '';
});

net.on('toast', (msg) => toast(msg.msg, msg.kind));

// generic confirmation modal
let confirmCb = null;
function confirmAction(text, cb) {
  confirmCb = cb;
  $('#confirm-text').textContent = text;
  $('#confirm-modal').classList.add('open');
}
$('#btn-confirm-yes').addEventListener('click', () => {
  $('#confirm-modal').classList.remove('open');
  const cb = confirmCb; confirmCb = null;
  sfx.click();
  cb?.();
});
$('#btn-confirm-no').addEventListener('click', () => {
  $('#confirm-modal').classList.remove('open');
  confirmCb = null;
  sfx.click();
});

// invites
let inviteFrom = null;
net.on('invited', (msg) => {
  inviteFrom = msg.from;
  $('#invite-text').innerHTML = `<b>${esc(msg.from.username)}</b> challenges you to a duel!`;
  $('#invite-modal').classList.add('open');
  sfx.invite();
});
$('#btn-invite-accept').addEventListener('click', () => {
  sfx.ok();
  $('#invite-modal').classList.remove('open');
  if (inviteFrom) net.send({ t: 'acceptInvite', uid: inviteFrom.uid });
});
$('#btn-invite-decline').addEventListener('click', () => {
  sfx.click();
  $('#invite-modal').classList.remove('open');
  if (inviteFrom) net.send({ t: 'declineInvite', uid: inviteFrom.uid });
  inviteFrom = null;
});

// ── menu actions ────────────────────────────────────────────────────────────

let queuedMatch = false;          // we found this room via the quick-match queue
let matchFoundActive = false;     // the "MATCH FOUND" splash is counting down
let matchFoundTimers = [];

$('#btn-quick').addEventListener('click', () => { sfx.select(); net.send({ t: 'queue' }); });
$('#btn-ranked').addEventListener('click', () => { sfx.click(); toast('⚔ RANKED is coming soon — sharpen your blade'); });
$('#btn-practice').addEventListener('click', () => { sfx.select(); net.send({ t: 'practice' }); });
$('#btn-cancel-queue').addEventListener('click', () => { sfx.click(); net.send({ t: 'unqueue' }); });

net.on('queued', () => { queuedMatch = true; $('#queue-overlay').classList.add('open'); });
net.on('unqueued', () => { queuedMatch = false; $('#queue-overlay').classList.remove('open'); });

// MATCH FOUND splash → short countdown → reveal character select
function startMatchFound(msg) {
  matchFoundActive = true;
  const opp = msg.players?.find(p => p.uid !== me?.uid);
  $('#mf-opp').textContent = opp ? `${opp.username}${opp.bot ? ' 🤖' : ''}` : 'opponent';
  $('#mf-count').textContent = '';
  $('#matchfound-overlay').classList.add('open');
  sfx.ready();
  let n = 3;
  const tick = () => {
    if (n > 0) {
      $('#mf-count').textContent = n;
      sfx.count();
      n--;
      matchFoundTimers.push(setTimeout(tick, 850));
    } else {
      matchFoundTimers.push(setTimeout(() => {
        cancelMatchFound();
        if (room && room.phase === 'select') {
          show('screen-select');
          animateSelect();
          refreshSelectUI();
        }
      }, 450));
    }
  };
  tick();
}

function cancelMatchFound() {
  matchFoundTimers.forEach(clearTimeout);
  matchFoundTimers = [];
  matchFoundActive = false;
  $('#matchfound-overlay').classList.remove('open');
}

$('#btn-howto').addEventListener('click', () => { sfx.click(); $('#howto-modal').classList.add('open'); });
$('#btn-swap-ab').addEventListener('click', () => {
  const v = !getSwapAB();
  setSwapAB(v);
  $('#btn-swap-ab').classList.toggle('on', v);
  $('#btn-swap-ab').textContent = v ? 'SWAP A/B: ON' : 'SWAP A/B: OFF';
  toast(v ? 'Face buttons swapped' : 'Standard face buttons');
});
$('#btn-swap-ab').classList.toggle('on', getSwapAB());
$('#btn-swap-ab').textContent = getSwapAB() ? 'SWAP A/B: ON' : 'SWAP A/B: OFF';
$('#btn-howto-close').addEventListener('click', () => { sfx.click(); $('#howto-modal').classList.remove('open'); });

// ── sound settings popover (music + sfx volume, mute-all) ────────────────────
const soundWrap = $('.sound-wrap');
const soundPanel = $('#sound-panel');
const volMusic = $('#vol-music');
const volSfx = $('#vol-sfx');

function refreshMuteIcon() {
  $('#mute-btn').textContent = isMuted() ? '🔇' : '🔊';
  $('#mute-toggle').textContent = isMuted() ? 'UNMUTE' : 'MUTE ALL';
  $('#mute-toggle').classList.toggle('on', isMuted());
}
volMusic.value = Math.round(getMusicVolume() * 100);
volSfx.value = Math.round(getSfxVolume() * 100);
refreshMuteIcon();

$('#mute-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  sfx.click();
  soundPanel.classList.toggle('open');
});
volMusic.addEventListener('input', () => setMusicVolume(volMusic.value / 100));
volSfx.addEventListener('input', () => setSfxVolume(volSfx.value / 100));
volSfx.addEventListener('change', () => sfx.ok());
$('#mute-toggle').addEventListener('click', () => { toggleMute(); refreshMuteIcon(); });
// close the panel when clicking elsewhere
document.addEventListener('click', (e) => {
  if (soundPanel.classList.contains('open') && !soundWrap.contains(e.target))
    soundPanel.classList.remove('open');
});

document.addEventListener('pad', (e) => {
  const el = $('#pad-indicator');
  if (e.detail.connected) {
    el.classList.add('on');
    el.title = e.detail.name;
    // a controller showed up — dismiss the "controller recommended" popup
    $('#pad-recommend-modal').classList.remove('open');
    toast('Controller connected', 'ok');
  } else {
    el.classList.remove('on');
    toast('Controller disconnected', 'error');
  }
});
if (padConnected()) $('#pad-indicator').classList.add('on');

// controller-recommended popup — shown on load until a pad is detected
$('#btn-pad-continue').addEventListener('click', () => {
  sfx.click();
  $('#pad-recommend-modal').classList.remove('open');
});
function maybeShowPadRecommend() {
  if (!padConnected()) $('#pad-recommend-modal').classList.add('open');
}

// ── character select ────────────────────────────────────────────────────────

const cardCanvases = new Map();
let selectAnimating = false;

function buildSelectGrid() {
  const grid = $('#select-grid');
  grid.innerHTML = '';
  for (const id of CHARACTER_LIST) {
    const c = CHARACTERS[id];
    const card = document.createElement('div');
    card.className = 'char-card';
    card.dataset.char = id;
    card.innerHTML = `
      <canvas width="180" height="200"></canvas>
      <div class="cc-name" style="--glow:${c.colors.glow}">${c.name}</div>
      <div class="cc-title">${c.title}</div>
      <div class="cc-stats">
        ${statBar('PWR', c.ui.power, c.colors.accent)}
        ${statBar('SPD', c.ui.speed, c.colors.accent)}
        ${statBar('REC', c.ui.recovery, c.colors.accent)}
        ${statBar('WGT', c.ui.weightStat, c.colors.accent)}
      </div>`;
    card.addEventListener('click', () => pickChar(id));
    card.addEventListener('mouseenter', () => sfx.hover());
    grid.appendChild(card);
    cardCanvases.set(id, card.querySelector('canvas'));
  }
}

function statBar(label, v, color) {
  return `<div class="stat"><span>${label}</span>
    <div class="bar"><i style="width:${v * 10}%;background:${color}"></i></div></div>`;
}

function pickChar(id) {
  if (readySent) return;
  selectedChar = id;
  localStorage.setItem('smash_char', id);
  sfx.select();
  net.send({ t: 'selectChar', charId: id });
  refreshSelectUI();
}

function refreshSelectUI() {
  $$('.char-card').forEach(card => {
    card.classList.toggle('selected', card.dataset.char === selectedChar);
    card.classList.toggle('locked', readySent && card.dataset.char === selectedChar);
  });
  const c = CHARACTERS[selectedChar];
  $('#select-desc').textContent = c.desc;
  const btn = $('#btn-ready');
  btn.disabled = false;
  btn.classList.toggle('is-ready', readySent);
  btn.innerHTML = readySent ? '✓ READY <small>tap to cancel</small>' : 'READY';

  if (room) {
    const opp = room.players?.find(p => p.uid !== me?.uid);
    const oppEl = $('#select-opp');
    if (opp) {
      const oc = opp.charId ? CHARACTERS[opp.charId] : null;
      const status = opp.dc ? '⚠ reconnecting…' : opp.ready ? '✓ READY' : 'not ready';
      oppEl.innerHTML = `
        <div class="opp-name">${esc(opp.username)}${opp.bot ? ' 🤖' : ''}</div>
        <div class="opp-pick" style="color:${oc ? oc.colors.accent : '#5d688c'}">
          ${oc ? oc.name : 'choosing…'}</div>
        <div class="opp-ready ${opp.ready ? 'rdy' : ''} ${opp.dc ? 'dc' : ''}">${status}</div>`;
    } else {
      oppEl.innerHTML = `<div class="opp-name">waiting…</div>`;
    }
  }
}

function animateSelect() {
  if (selectAnimating) return;
  selectAnimating = true;
  let hoverT = 0;
  const loop = () => {
    if (!$('#screen-select').classList.contains('active')) { selectAnimating = false; return; }
    hoverT += 1 / 60;
    for (const [id, cv] of cardCanvases) {
      const hovered = cv.parentElement.matches(':hover') || id === selectedChar;
      drawPortrait(cv, id, hoverT, hovered ? 1 : 0);
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function readyUp() {
  if (readySent) {
    // tap again to cancel
    readySent = false;
    sfx.click();
    net.send({ t: 'unready' });
  } else {
    readySent = true;
    sfx.ready();
    net.send({ t: 'ready', charId: selectedChar });
  }
  refreshSelectUI();
}
$('#btn-ready').addEventListener('click', readyUp);

$('#btn-leave-select').addEventListener('click', () => {
  sfx.click();
  net.send({ t: 'leaveRoom' });
  leaveToMenu();
});

// ── room / match lifecycle ──────────────────────────────────────────────────

net.on('room', (msg) => {
  room = msg;
  $('#queue-overlay').classList.remove('open');
  if (msg.phase === 'select') {
    // trust the server's view of our ready state (covers reconnects)
    readySent = !!msg.players?.find(p => p.uid === me?.uid)?.ready;
    // a match that just finished sends the rematch lobby right behind 'end' —
    // stay put and let the results screen take over; REMATCH routes to select
    const resultsPending = lastResults || (match && match.over) ||
      $('#screen-results').classList.contains('active');
    if (!resultsPending && !matchFoundActive) {
      if (match) { match.stop(); match = null; }
      if (queuedMatch) {
        // quick match: play the MATCH FOUND countdown, then reveal select
        queuedMatch = false;
        startMatchFound(msg);
      } else {
        show('screen-select');
        animateSelect();
      }
    }
    // sync our pick only if the server doesn't have it yet — re-sending
    // unconditionally created a broadcast feedback loop
    const mine = msg.players?.find(p => p.uid === me?.uid);
    if (mine && !mine.ready && mine.charId !== selectedChar) {
      net.send({ t: 'selectChar', charId: selectedChar });
    }
    refreshSelectUI();
  }
});

net.on('start', (msg) => {
  cancelMatchFound();
  room = { ...room, phase: 'playing' };
  lastResults = null;
  show('screen-game');
  if (!renderer) renderer = new Renderer($('#game-canvas'));
  renderer.resize();
  renderer.hudPercent = [];
  if (match) match.stop();
  match = new MatchClient({ renderer, players: msg.players, myUid: me.uid });
  match.init(msg.s);
  match.start();
  window.__match = match; // debug/testing handle
  renderer.setAnnounce('3', '', 0.7, '#ffffff');
});

net.on('snap', (msg) => match?.onSnap(msg));

// reconnected into a live match — rebuild or rebase the client
net.on('resync', (msg) => {
  room = { roomId: msg.roomId, phase: 'playing' };
  if (match) {
    match.resync(msg);
  } else {
    show('screen-game');
    if (!renderer) renderer = new Renderer($('#game-canvas'));
    renderer.resize();
    renderer.hudPercent = [];
    match = new MatchClient({ renderer, players: msg.players, myUid: me.uid });
    match.init(msg.s);
    match.resync(msg);
    match.start();
    window.__match = match;
  }
  if (!$('#screen-game').classList.contains('active')) show('screen-game');
  toast('Reconnected to your match');
});

// re-authed but the match is gone (forfeited while away)
net.on('roomGone', () => {
  const inGameUi = ['screen-game', 'screen-select'].includes(document.body.dataset.screen);
  if (match || room || inGameUi) {
    if (match) { match.stop(); match = null; }
    room = null;
    readySent = false;
    lastResults = null;
    queuedMatch = false;
    cancelMatchFound();
    show('screen-menu');
    toast('Your match ended while you were away', 'error');
  }
});
net.on('paused', (msg) => match?.onPaused(msg));
net.on('resuming', (msg) => match?.onResuming(msg));
net.on('resumed', () => match?.onResumed());

net.on('end', (msg) => {
  lastResults = msg;
  setTimeout(() => showResults(msg), 1800);
});

net.on('oppLeft', (msg) => {
  toast(msg.reason === 'disconnected' ? 'Opponent disconnected' : 'Opponent left the match', 'error');
  leaveToMenu();
});

function showResults(msg) {
  if (!$('#screen-game').classList.contains('active') && !match) return;
  if (match) { match.stop(); match = null; }
  const winnerP = msg.players.find(p => p.idx === msg.winner);
  const iWon = winnerP && winnerP.uid === me?.uid;
  $('#results-title').textContent = iWon ? 'VICTORY' : 'DEFEAT';
  $('#results-title').className = iWon ? 'win' : 'lose';
  $('#results-sub').textContent = winnerP ? `${winnerP.username} wins the duel` : 'Draw';
  const rows = msg.players.map(p => {
    const c = CHARACTERS[p.charId];
    return `<div class="res-row ${p.idx === msg.winner ? 'winner' : ''}">
      <span class="res-char" style="color:${c.colors.accent}">${c.name}</span>
      <span class="res-name">${esc(p.username)}</span>
      <span class="res-stocks">${'●'.repeat(Math.max(0, p.stocks))}${'○'.repeat(3 - Math.max(0, p.stocks))}</span>
      <span class="res-pct">${p.percent}%</span>
    </div>`;
  }).join('');
  $('#results-stats').innerHTML = rows;
  show('screen-results');
}

$('#btn-rematch').addEventListener('click', () => {
  sfx.select();
  lastResults = null;
  if (!room) return leaveToMenu();
  readySent = false;
  show('screen-select');
  animateSelect();
  const minePick = room?.players?.find(p => p.uid === me?.uid);
  if (!minePick || minePick.charId !== selectedChar) {
    net.send({ t: 'selectChar', charId: selectedChar });
  }
  refreshSelectUI();
});

$('#btn-results-leave').addEventListener('click', () => {
  sfx.click();
  net.send({ t: 'leaveRoom' });
  leaveToMenu();
});

function leaveToMenu() {
  if (match) { match.stop(); match = null; }
  room = null;
  lastResults = null;
  readySent = false;
  queuedMatch = false;
  cancelMatchFound();
  $('#queue-overlay').classList.remove('open');
  show(me ? 'screen-menu' : 'screen-auth');
}

// ── menu ambient background ─────────────────────────────────────────────────

function menuBackground() {
  const cv = $('#bg-canvas');
  const ctx = cv.getContext('2d');
  const stars = [];
  for (let i = 0; i < 140; i++) {
    stars.push({ x: Math.random(), y: Math.random(), z: 0.2 + Math.random() * 0.8, tw: Math.random() * 7 });
  }
  let t = 0;
  const loop = () => {
    // only animate when a menu screen is up (game has its own canvas)
    const gameActive = $('#screen-game').classList.contains('active');
    if (!gameActive) {
      const w = cv.width = cv.clientWidth * devicePixelRatio;
      const h = cv.height = cv.clientHeight * devicePixelRatio;
      t += 1 / 60;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#05060f'); g.addColorStop(0.55, '#0c1026'); g.addColorStop(1, '#190f2e');
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      const n1 = ctx.createRadialGradient(w * 0.78, h * 0.2, 10, w * 0.78, h * 0.2, w * 0.45);
      n1.addColorStop(0, '#3b2a7a44'); n1.addColorStop(1, '#3b2a7a00');
      ctx.fillStyle = n1; ctx.fillRect(0, 0, w, h);
      const n2 = ctx.createRadialGradient(w * 0.15, h * 0.75, 10, w * 0.15, h * 0.75, w * 0.4);
      n2.addColorStop(0, '#43164e3c'); n2.addColorStop(1, '#43164e00');
      ctx.fillStyle = n2; ctx.fillRect(0, 0, w, h);
      for (const s of stars) {
        const tw = 0.4 + 0.6 * Math.abs(Math.sin(t * (0.6 + s.z) + s.tw));
        ctx.globalAlpha = tw * s.z;
        ctx.fillStyle = '#cfe2ff';
        ctx.beginPath();
        ctx.arc(s.x * w, (s.y * h + t * s.z * 6) % h, s.z * 1.6 * devicePixelRatio, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }
    requestAnimationFrame(loop);
  };
  loop();
}

// ── on-screen keyboard (controller text entry) ──────────────────────────────

let oskTarget = null;   // the <input> being edited
let oskShift = false;

const OSK_ROWS = [
  ['1', '2', '3', '4', '5', '6', '7', '8', '9', '0'],
  ['Q', 'W', 'E', 'R', 'T', 'Y', 'U', 'I', 'O', 'P'],
  ['A', 'S', 'D', 'F', 'G', 'H', 'J', 'K', 'L', '_'],
  ['⇧', 'Z', 'X', 'C', 'V', 'B', 'N', 'M', '⌫'],
  ['CANCEL', 'DONE'],
];

function buildOsk() {
  const wrap = $('#osk-keys');
  wrap.innerHTML = '';
  for (const row of OSK_ROWS) {
    const r = document.createElement('div');
    r.className = 'osk-row';
    for (const key of row) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'osk-key' + (key.length > 1 && key !== '⌫' && key !== '⇧' ? ' wide' : '') + (key === 'DONE' ? ' done' : '');
      b.dataset.key = key;
      b.textContent = key;
      b.addEventListener('click', () => oskPress(key));
      r.appendChild(b);
    }
    wrap.appendChild(r);
  }
}

function oskRefresh() {
  if (!oskTarget) return;
  const v = oskTarget.value;
  const shown = oskTarget.type === 'password' ? '•'.repeat(v.length) : v;
  $('#osk-value').innerHTML = `${esc(shown)}<span class="caret">_</span>`;
  $$('#osk-keys .osk-key').forEach(b => {
    const k = b.dataset.key;
    if (k.length === 1 && /[a-z]/i.test(k)) b.textContent = oskShift ? k.toUpperCase() : k.toLowerCase();
    if (k === '⇧') b.classList.toggle('on', oskShift);
  });
}

function oskPress(key) {
  if (!oskTarget) return;
  sfx.click();
  if (key === 'DONE' || key === 'CANCEL') { closeOsk(); return; }
  if (key === '⇧') { oskShift = !oskShift; oskRefresh(); return; }
  if (key === '⌫') {
    oskTarget.value = oskTarget.value.slice(0, -1);
  } else if (oskTarget.value.length < (parseInt(oskTarget.maxLength) > 0 ? oskTarget.maxLength : 64)) {
    const ch = /[a-z]/i.test(key) ? (oskShift ? key.toUpperCase() : key.toLowerCase()) : key;
    oskTarget.value += ch;
  }
  oskTarget.dispatchEvent(new Event('input', { bubbles: true }));
  oskRefresh();
}

function openOsk(input) {
  oskTarget = input;
  oskShift = true;   // tags usually start uppercase
  $('#osk-label').textContent =
    (input.closest('label')?.textContent || input.placeholder || 'TYPE').trim().split('\n')[0].toUpperCase();
  $('#osk-modal').classList.add('open');
  oskRefresh();
  setPadFocus($('#osk-keys .osk-key'));
  sfx.select();
}

function closeOsk() {
  $('#osk-modal').classList.remove('open');
  const t = oskTarget;
  oskTarget = null;
  if (t) setPadFocus(t);   // hand focus back to the field
}

buildOsk();
window.__osk = openOsk; // debug/testing handle

// ── controller menu navigation (works on every screen + modal) ──────────────
//
// Spatial navigation: d-pad / left stick moves a focus ring between the
// visible interactive elements; A activates, B backs out.

let padFocus = null;

function navScope() {
  const modal = document.querySelector('.modal.open .modal-box');
  if (modal) return modal;
  if ($('#queue-overlay').classList.contains('open')) return $('#queue-overlay');
  return document.querySelector('.screen.active');
}

function navItems(scope) {
  if (!scope) return [];
  return [...scope.querySelectorAll('button, .char-card, .mode-btn, input')]
    .filter(el => !el.disabled && el.offsetParent !== null && el.getClientRects().length);
}

function setPadFocus(el) {
  if (padFocus === el) return;
  padFocus?.classList.remove('pad-focus');
  padFocus = el || null;
  if (padFocus) {
    padFocus.classList.add('pad-focus');
    padFocus.scrollIntoView({ block: 'nearest' });
    sfx.hover();
  }
}

function movePadFocus(dx, dy) {
  const items = navItems(navScope());
  if (!items.length) return;
  if (!padFocus || !items.includes(padFocus)) { setPadFocus(items[0]); return; }
  const r0 = padFocus.getBoundingClientRect();
  const c0 = { x: r0.left + r0.width / 2, y: r0.top + r0.height / 2 };
  let best = null, bestScore = Infinity;
  for (const el of items) {
    if (el === padFocus) continue;
    const r = el.getBoundingClientRect();
    const vx = (r.left + r.width / 2) - c0.x;
    const vy = (r.top + r.height / 2) - c0.y;
    const along = vx * dx + vy * dy;          // progress in the pressed direction
    if (along <= 4) continue;
    const ortho = Math.abs(vx * dy) + Math.abs(vy * dx);
    const score = along + ortho * 2.2;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (best) setPadFocus(best);
}

function padBack(scope) {
  const back = scope?.querySelector('[data-back]');
  if (back) { sfx.click(); back.click(); }
}

function padNavLoop() {
  const inGame = $('#screen-game').classList.contains('active');
  if (inGame) {
    setPadFocus(null);
  } else {
    const nav = samplePadMenu();
    const scope = navScope();
    if (nav.left) movePadFocus(-1, 0);
    if (nav.right) movePadFocus(1, 0);
    if (nav.up) movePadFocus(0, -1);
    if (nav.down) movePadFocus(0, 1);
    if (nav.confirm) {
      const items = navItems(scope);
      if (padFocus && items.includes(padFocus)) {
        if (padFocus.tagName === 'INPUT') openOsk(padFocus);
        else { sfx.click(); padFocus.click(); }
      } else if (items.length) setPadFocus(items[0]);
    }
    if (nav.back) {
      if (oskTarget) oskPress(oskTarget.value ? '⌫' : 'CANCEL');
      else padBack(scope);
    }
    // drop focus if the element left the screen
    if (padFocus && !navItems(scope).includes(padFocus)) setPadFocus(null);
  }
  requestAnimationFrame(padNavLoop);
}
padNavLoop();

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── boot ────────────────────────────────────────────────────────────────────

buildSelectGrid();
refreshSelectUI();
menuBackground();
show('screen-auth');
maybeShowPadRecommend();
net.connect();
