import { Game } from './Game.js';
import { CHARACTERS } from './characters.js';

const ids = Object.keys(CHARACTERS);
let selectedId = ids[0];

const grid = document.getElementById('charGrid');
const cards = {};

ids.forEach((id, i) => {
  const def = CHARACTERS[id];
  const card = document.createElement('div');
  card.className = 'charCard';
  card.style.setProperty('--accent', def.color);
  card.innerHTML =
    `<h2>${def.name}<span class="key">${i + 1}</span></h2>` +
    `<p class="role">${def.role}</p>` +
    `<ul>${def.blurb.map((b) => `<li>${b}</li>`).join('')}</ul>`;
  card.addEventListener('click', () => select(id));
  grid.appendChild(card);
  cards[id] = card;
});

function select(id) {
  selectedId = id;
  for (const cid of ids) cards[cid].classList.toggle('selected', cid === id);
}
select(selectedId);

function startGame() {
  document.getElementById('startMenu').style.display = 'none';
  document.getElementById('hud').style.display = 'block';
  document.removeEventListener('keydown', menuKeys);
  const game = new Game(selectedId);
  window.game = game; // debugging/testing handle
  game.start();
}

function menuKeys(e) {
  const i = ['Digit1', 'Digit2', 'Digit3', 'Digit4'].indexOf(e.code);
  if (i >= 0 && ids[i]) select(ids[i]);
  if (e.code === 'Enter') startGame();
}

document.addEventListener('keydown', menuKeys);
document.getElementById('startButton').addEventListener('click', startGame);
