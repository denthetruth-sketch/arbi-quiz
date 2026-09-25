// Чистые правила игры: порядок экранов и подсчёт баллов.
// Здесь нет ни базы, ни браузера — только логика, которую можно проверить отдельно.

import { QUIZ } from './quiz-data.js';

export function buildSteps() {
  const steps = [{ type: 'lobby' }];
  QUIZ.rounds.forEach((round, ri) => {
    steps.push({ type: 'round', ri });
    round.questions.forEach((q, qi) => {
      if (round.kind === 'bet') steps.push({ type: 'bet', ri, qi });
      steps.push({ type: 'question', ri, qi });
      steps.push({ type: 'reveal', ri, qi });
    });
    steps.push({ type: 'scoreboard', ri });
    if (ri === 2) {
      steps.push({ type: 'transition' });
      steps.push({ type: 'partner' });
    }
  });
  steps.push({ type: 'end' });
  return steps;
}

export const STEPS = buildSteps();

export function stepAt(i) {
  const n = Math.max(0, Math.min(STEPS.length - 1, i | 0));
  return STEPS[n];
}

export function roundOf(step) {
  return step && step.ri != null ? QUIZ.rounds[step.ri] : null;
}

export function questionOf(step) {
  const r = roundOf(step);
  return r && step.qi != null ? r.questions[step.qi] : null;
}

export function roundLabel(round) {
  if (!round) return '';
  return round.label || ('РАУНД ' + round.n + ' · ' + round.name);
}

export function keyOf(step) {
  return 'r' + step.ri + 'q' + step.qi;
}

export function stepTitle(step) {
  switch (step.type) {
    case 'lobby': return 'Сбор команд';
    case 'round': return roundLabel(roundOf(step)) + ' — заставка';
    case 'bet': return roundLabel(roundOf(step)) + ' — приём ставок ' + (step.qi + 1);
    case 'question': return roundLabel(roundOf(step)) + ' — вопрос ' + (step.qi + 1);
    case 'reveal': return roundLabel(roundOf(step)) + ' — ответ ' + (step.qi + 1);
    case 'scoreboard': return 'Табло после раунда ' + roundOf(step).n;
    case 'transition': return 'Реплика перед блоком ARBI';
    case 'partner': return 'Блок ARBI';
    case 'end': return 'Итоги и награждение';
    default: return '';
  }
}

export function parseNum(v) {
  if (v == null) return null;
  const s = String(v).replace(',', '.').replace(/[^0-9.\-]/g, '');
  if (!s) return null;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

// Автоматический вердикт по каждой команде: верно / неверно.
export function autoVerdicts(round, q, teamIds, answers) {
  const out = {};
  teamIds.forEach((id) => { out[id] = false; });

  if (round.kind === 'mc') {
    teamIds.forEach((id) => {
      out[id] = answers[id] != null && Number(answers[id]) === q.correct;
    });
    return out;
  }

  if (q.rule === 'closest-not-over') {
    let best = null;
    teamIds.forEach((id) => {
      const v = parseNum(answers[id]);
      if (v == null || v > q.correctValue) return;
      if (best == null || v > best) best = v;
    });
    if (best != null) {
      teamIds.forEach((id) => {
        const v = parseNum(answers[id]);
        out[id] = v != null && v === best;
      });
    }
    return out;
  }

  if (q.rule === 'tolerance') {
    teamIds.forEach((id) => {
      const v = parseNum(answers[id]);
      out[id] = v != null && Math.abs(v - q.correctValue) <= (q.tolerance || 0);
    });
    return out;
  }

  // rule === 'manual' — ведущий отмечает сам
  return out;
}

// Сколько баллов команда получает или теряет.
export function deltaFor(round, verdict, bet) {
  if (round.kind === 'mc') return verdict ? round.points : 0;
  const b = Math.max(0, Math.floor(Number(bet) || 0));
  return verdict ? b * round.winMultiplier : -b * round.loseMultiplier;
}

// Итоговый счёт после начисления — никогда не ниже нуля.
export function applyDelta(score, delta) {
  return Math.max(0, score + delta);
}

// Ставка в допустимых границах раунда и возможностей команды.
export function clampBet(round, raw, score) {
  const openMax = round.betMax == null ? score : round.betMax;
  if (openMax <= 0) return 0;
  let v = Math.floor(Number(raw) || 0);
  if (v < round.betMin) v = round.betMin;
  if (v > openMax) v = openMax;
  return v;
}

export function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

export function sortedTeams(teams) {
  return Object.entries(teams || {})
    .map(([id, t]) => ({ id, name: t.name, score: Number(t.score) || 0, joinedAt: t.joinedAt || 0 }))
    .sort((a, b) => a.joinedAt - b.joinedAt);
}

export function ranked(teams) {
  return sortedTeams(teams).sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

// ---------- названия команд ----------

export const MAX_TEAMS = 6;
export const NAME_MAX = 24;

// Пробелы схлопываются, длина обрезается. Пустая строка — названия нет.
export function cleanTeamName(s) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);
}

// Занято ли название: без учёта регистра, лишних пробелов и разницы «е»/«ё».
export function nameTaken(teams, name) {
  const norm = (x) => cleanTeamName(x).toLowerCase().replace(/ё/g, 'е');
  const n = norm(name);
  return Object.values(teams || {}).some((t) => norm(t && t.name) === n);
}
