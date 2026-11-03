// Связь с базой. Экран и телефоны говорят только через этот модуль.
//
// В базе всё лежит в aiclub/<комната>:
//   state/slide              — какой экран сейчас открыт (0…5)
//   answers/<вопрос>/<ключ>  — { t: текст | v: число, d: телефон, at: время, hidden?: true }
//
// screen.html?demo — демо-режим без базы: выдуманные ответы, чтобы посмотреть, как выглядит.

import { SLIDES } from './config.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
const params = new URLSearchParams(location.search);

export const DEMO = params.has('demo');
export const ROOM = (params.get('room') || 'main').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24) || 'main';

export function deviceId() {
  const KEY = 'aiclub:device';
  let id = null;
  try { id = localStorage.getItem(KEY); } catch (e) { /* приватный режим */ }
  if (!id) {
    id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
    try { localStorage.setItem(KEY, id); } catch (e) { /* приватный режим */ }
  }
  return id;
}

export async function openStore() {
  return DEMO ? demoStore() : firebaseStore();
}

async function firebaseStore() {
  const [appMod, dbMod, cfgMod] = await Promise.all([
    import(FB + 'firebase-app.js'),
    import(FB + 'firebase-database.js'),
    import('../firebase-config.js')
  ]);
  const { initializeApp } = appMod;
  const { getDatabase, ref, onValue, set, push, remove, serverTimestamp } = dbMod;
  const app = initializeApp(cfgMod.firebaseConfig, 'aiclub');
  const db = getDatabase(app);
  const base = 'aiclub/' + ROOM;
  const r = (sub) => ref(db, base + '/' + sub);

  return {
    onConnection(cb) { onValue(ref(db, '.info/connected'), (s) => cb(s.val() === true)); },
    onSlide(cb, onError) { onValue(r('state/slide'), (s) => cb(s.val()), onError); },
    setSlide(n) { return set(r('state/slide'), n); },
    onAnswers(cb, onError) { onValue(r('answers'), (s) => cb(s.val() || {}), onError); },
    addText(qid, text, device) {
      return push(r('answers/' + qid), { t: text, d: device, at: serverTimestamp() });
    },
    setNumber(qid, v, device) {
      return set(r('answers/' + qid + '/' + device), { v, d: device, at: serverTimestamp() });
    },
    setHidden(qid, key, hidden) { return set(r('answers/' + qid + '/' + key + '/hidden'), hidden ? true : null); },
    clear(qid) { return remove(r('answers/' + qid)); }
  };
}

// ---------- демо ----------

const DEMO_TEXT = {
  sources: ['CRM', 'amoCRM', 'Bitrix24', 'Google Analytics', 'Яндекс Метрика', 'Excel', 'Google Таблицы',
    'CRM', 'Рекламный кабинет Meta', 'опросы клиентов', 'CRM', 'Telegram-бот', '1С', 'Power BI', 'amoCRM',
    'Google Analytics', 'звонки', 'CRM', 'Notion', 'руками', 'Яндекс Метрика', 'POS-система', 'CRM', 'Booking.com'],
  ideas: [
    'Бот, который сам отвечает гостям отеля и бронирует трансфер',
    'ИИ-юрист для проверки договоров аренды на Пхукете',
    'Сервис, который из звонков менеджеров делает отчёт для руководителя',
    'Генератор контент-плана для кофейни на месяц вперёд',
    'Помощник риелтора: подбирает виллы по голосовому сообщению',
    'Агент, который сверяет счета поставщиков с заказами',
    'Персональный тренер по тайскому языку в Telegram',
    'Анализ отзывов с Google Maps и подсказки, что улучшить',
    'Автоматический монтаж рилсов из длинного видео',
    'ИИ-бухгалтер для фрилансеров с тайскими налогами'
  ]
};

function demoStore() {
  let slide = 0;
  const answers = {};
  const slideCbs = [];
  const answerCbs = [];
  let seq = 0;
  const key = () => 'k' + String(++seq).padStart(5, '0');
  const fire = () => answerCbs.forEach((cb) => cb(JSON.parse(JSON.stringify(answers))));

  function addDemo(qid, n) {
    const q = SLIDES.find((s) => s.id === qid);
    answers[qid] = answers[qid] || {};
    for (let i = 0; i < n; i++) {
      const d = 'demo' + Math.floor(Math.random() * 40);
      if (q.kind === 'percent') {
        const v = Math.max(0, Math.min(100, Math.round((Math.random() * 0.8 + Math.random() * 0.4) * 60 / 5) * 5));
        answers[qid]['p' + (++seq)] = { v, d: 'p' + seq, at: Date.now() };
      } else {
        const list = DEMO_TEXT[qid];
        const pick = qid === 'ideas' ? list[seq % list.length] : list[Math.floor(Math.random() * list.length)];
        answers[qid][key()] = { t: pick, d, at: Date.now() };
      }
    }
  }
  addDemo('sources', 18);
  addDemo('ideas', 6);
  addDemo('delegate', 21);

  setInterval(() => {
    const s = SLIDES[slide];
    if (s && s.type === 'question') { addDemo(s.id, 1); fire(); }
  }, 2600);

  return {
    onConnection(cb) { cb(true); },
    onSlide(cb) { slideCbs.push(cb); cb(slide); },
    setSlide(n) { slide = n; slideCbs.forEach((cb) => cb(slide)); return Promise.resolve(); },
    onAnswers(cb) { answerCbs.push(cb); cb(JSON.parse(JSON.stringify(answers))); },
    addText(qid, t, d) { (answers[qid] = answers[qid] || {})[key()] = { t, d, at: Date.now() }; fire(); return Promise.resolve(); },
    setNumber(qid, v, d) { (answers[qid] = answers[qid] || {})[d] = { v, d, at: Date.now() }; fire(); return Promise.resolve(); },
    setHidden(qid, k, h) { if (answers[qid] && answers[qid][k]) { if (h) answers[qid][k].hidden = true; else delete answers[qid][k].hidden; } fire(); return Promise.resolve(); },
    clear(qid) { delete answers[qid]; fire(); return Promise.resolve(); }
  };
}

// ---------- общие помощники ----------

export function el(tag, attrs, children) {
  const n = document.createElement(tag);
  if (attrs) {
    Object.entries(attrs).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k === 'style') n.setAttribute('style', v);
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
      else n.setAttribute(k, v === true ? '' : v);
    });
  }
  (children || []).forEach((c) => {
    if (c == null || c === false) return;
    n.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  });
  return n;
}

// 1 человек, 2 человека, 5 человек
export function plural(n, one, few, many) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

export function clampSlide(n) {
  const v = Number.isFinite(n) ? Math.round(n) : 0;
  return Math.max(0, Math.min(SLIDES.length - 1, v));
}
