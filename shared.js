// Подключение к базе и мелкие помощники для интерфейса.
// Правила игры лежат отдельно, в rules.js — там нет браузера и базы.

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getDatabase, ref, onValue, get, set, update, remove
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-database.js';
import { firebaseConfig } from './firebase-config.js';
import { QUIZ, TEAM_NAMES } from './quiz-data.js';

export * from './rules.js';
export { QUIZ, TEAM_NAMES, ref, onValue, get, set, update, remove };

const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

// ---------- комната ----------

export function roomCode() {
  const p = new URLSearchParams(location.search).get('room');
  return (p || 'ARBI').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'ARBI';
}

export const ROOM = roomCode();
export const path = (sub) => 'rooms/' + ROOM + (sub ? '/' + sub : '');
export const R = (sub) => ref(db, path(sub));

// ---------- часы сервера ----------

let clockOffset = 0;
onValue(ref(db, '.info/serverTimeOffset'), (snap) => {
  clockOffset = snap.val() || 0;
});
export const serverNow = () => Date.now() + clockOffset;

// ---------- связь ----------

export function onConnection(cb) {
  onValue(ref(db, '.info/connected'), (snap) => cb(snap.val() === true));
}

// ---------- построение DOM ----------

export function el(tag, attrs, children) {
  const n = document.createElement(tag);
  if (attrs) {
    Object.entries(attrs).forEach(([k, v]) => {
      if (v == null) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'style') n.setAttribute('style', v);
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
      else n.setAttribute(k, v);
    });
  }
  (children || []).forEach((c) => {
    if (c == null) return;
    n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return n;
}
