// Подсчёт ответов. Без браузера и базы — только данные, чтобы было что проверить отдельно.

export function visible(bucket) {
  return Object.entries(bucket || {})
    .filter(([, a]) => a && !a.hidden)
    .map(([key, a]) => ({ key, ...a }))
    .sort((x, y) => (x.at || 0) - (y.at || 0) || (x.key < y.key ? -1 : 1));
}

export function hiddenCount(bucket) {
  return Object.values(bucket || {}).filter((a) => a && a.hidden).length;
}

// сколько разных телефонов ответило
export function people(bucket) {
  return new Set(visible(bucket).map((a) => a.d)).size;
}

export function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'`.!?()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// «CRM, Excel; опросы» — это три источника, а не один
export function splitParts(text) {
  return String(text || '')
    .split(/[,;\n/+]|\s+и\s+/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => normalize(p).length > 0);
}

// облако: одинаковые ответы склеиваются, показывается самое частое написание
export function cloudWords(bucket, split = true) {
  const groups = new Map();
  visible(bucket).forEach((a) => {
    (split ? splitParts(a.t) : [String(a.t || '').replace(/\s+/g, ' ').trim()].filter(Boolean)).forEach((part) => {
      const k = normalize(part);
      if (!groups.has(k)) groups.set(k, { key: k, count: 0, forms: new Map(), answerKeys: new Set(), first: a.at || 0 });
      const g = groups.get(k);
      g.count += 1;
      g.forms.set(part, (g.forms.get(part) || 0) + 1);
      g.answerKeys.add(a.key);
    });
  });
  return [...groups.values()].map((g) => {
    let label = '';
    let best = -1;
    g.forms.forEach((n, form) => { if (n > best) { best = n; label = form; } });
    return { key: g.key, label, count: g.count, answerKeys: [...g.answerKeys], first: g.first };
  }).sort((a, b) => b.count - a.count || a.first - b.first);
}

export function percentStats(bucket) {
  const vals = visible(bucket)
    .map((a) => Number(a.v))
    .filter((v) => Number.isFinite(v))
    .map((v) => Math.max(0, Math.min(100, v)));
  const bins = new Array(10).fill(0);
  vals.forEach((v) => { bins[Math.min(9, Math.floor(v / 10))] += 1; });
  const n = vals.length;
  const avg = n ? vals.reduce((s, v) => s + v, 0) / n : 0;
  return { n, avg, bins };
}

// выбор варианта: сколько за каждый и средняя ступень (для шкалы)
export function choiceStats(bucket, k) {
  const counts = new Array(k).fill(0);
  let sum = 0;
  let n = 0;
  visible(bucket).forEach((a) => {
    const v = Number(a.v);
    if (!Number.isInteger(v) || v < 0 || v >= k) return;
    counts[v] += 1;
    sum += v;
    n += 1;
  });
  return { n, counts, avg: n ? sum / n : 0 };
}
