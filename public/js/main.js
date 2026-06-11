// ─────────────────────────────────────────────────────────────────────────────
// App shell: screen routing, auth, friends/invites, character select, results.
// ─────────────────────────────────────────────────────────────────────────────

import { net } from './net.js';
import { sfx, toggleMute, isMuted } from './sfx.js';
import { MatchClient } from './game.js';
import { Renderer } from './renderer.js';
import { drawPortrait } from './fighters.js';
import { CHARACTERS, CHARACTER_LIST } from '/shared/characters.js';
import { padConnected, samplePadMenu } from './input.js';

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
      net.send({ t: 'removeFriend', uid: f.uid });
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

$('#btn-quick').addEventListener('click', () => { sfx.select(); net.send({ t: 'queue' }); });
$('#btn-practice').addEventListener('click', () => { sfx.select(); net.send({ t: 'practice' }); });
$('#btn-cancel-queue').addEventListener('click', () => { sfx.click(); net.send({ t: 'unqueue' }); });

net.on('queued', () => $('#queue-overlay').classList.add('open'));
net.on('unqueued', () => $('#queue-overlay').classList.remove('open'));

$('#btn-howto').addEventListener('click', () => { sfx.click(); $('#howto-modal').classList.add('open'); });
$('#btn-howto-close').addEventListener('click', () => { sfx.click(); $('#howto-modal').classList.remove('open'); });

$('#mute-btn').addEventListener('click', () => {
  const m = toggleMute();
  $('#mute-btn').textContent = m ? '🔇' : '🔊';
});
$('#mute-btn').textContent = isMuted() ? '🔇' : '🔊';

document.addEventListener('pad', (e) => {
  const el = $('#pad-indicator');
  if (e.detail.connected) {
    el.classList.add('on');
    el.title = e.detail.name;
    toast('Controller connected', 'ok');
  } else {
    el.classList.remove('on');
    toast('Controller disconnected', 'error');
  }
});
if (padConnected()) $('#pad-indicator').classList.add('on');

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
  });
  const c = CHARACTERS[selectedChar];
  $('#select-desc').textContent = c.desc;
  $('#btn-ready').disabled = readySent;
  $('#btn-ready').textContent = readySent ? 'WAITING…' : 'READY';

  if (room) {
    const opp = room.players.find(p => p.uid !== me?.uid);
    const oppEl = $('#select-opp');
    if (opp) {
      const oc = opp.charId ? CHARACTERS[opp.charId] : null;
      oppEl.innerHTML = `
        <div class="opp-name">${esc(opp.username)}${opp.bot ? ' 🤖' : ''}</div>
        <div class="opp-pick" style="color:${oc ? oc.colors.accent : '#5d688c'}">
          ${oc ? oc.name : 'choosing…'}</div>
        <div class="opp-ready ${opp.ready ? 'rdy' : ''}">${opp.ready ? '✓ READY' : 'not ready'}</div>`;
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
    // gamepad navigation
    const nav = samplePadMenu();
    if (nav.left || nav.right) {
      const i = CHARACTER_LIST.indexOf(selectedChar);
      const ni = (i + (nav.right ? 1 : -1) + CHARACTER_LIST.length) % CHARACTER_LIST.length;
      pickChar(CHARACTER_LIST[ni]);
    }
    if (nav.confirm) readyUp();
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

function readyUp() {
  if (readySent) return;
  readySent = true;
  sfx.ready();
  net.send({ t: 'ready', charId: selectedChar });
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
    readySent = false;
    // a match that just finished sends the rematch lobby right behind 'end' —
    // stay put and let the results screen take over; REMATCH routes to select
    const resultsPending = lastResults || (match && match.over) ||
      $('#screen-results').classList.contains('active');
    if (!resultsPending) {
      if (match) { match.stop(); match = null; }
      show('screen-select');
      animateSelect();
    }
    net.send({ t: 'selectChar', charId: selectedChar });
    refreshSelectUI();
  }
});

net.on('start', (msg) => {
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
  net.send({ t: 'selectChar', charId: selectedChar });
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

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ── boot ────────────────────────────────────────────────────────────────────

buildSelectGrid();
refreshSelectUI();
menuBackground();
show('screen-auth');
net.connect();
