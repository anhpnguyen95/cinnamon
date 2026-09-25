// Cinnamon core logic for the web trial. A port of CinnamonCore (Swift): no DOM, no network.
// All times are milliseconds since the epoch; "minutes" are minutes after local midnight,
// and may exceed 1440 for after-midnight times that belong to the same day (bed at 01:00 = 1500).

export const MEALS = ['breakfast', 'lunch', 'dinner'];

export const MEAL_NAMES = { breakfast: 'bữa sáng', lunch: 'bữa trưa', dinner: 'bữa tối' };
export const MEAL_SHORT = { breakfast: 'Sáng', lunch: 'Trưa', dinner: 'Tối' };

export const DEFAULT_RHYTHM = { wake: 7 * 60, breakfast: 7 * 60 + 30, lunch: 12 * 60, dinner: 19 * 60, bed: 23 * 60 };

export const DEFAULT_SETTINGS = {
  beforeMealLead: 30,
  afterMealDelay: 15,
  missedAfter: 90,
  snooze: 15,
  renudge: [15, 45],
};

export const DEFAULT_THRESHOLDS = {
  aqiCaution: 51,
  aqiDanger: 101,
  aqiSevere: 151,
  uvCaution: 3,
  heatCaution: 32,
  heatDanger: 40,
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

// ---------- Time ----------

export function startOfDay(ms) {
  const d = new Date(ms);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
}

export function addDays(dayStart, n) {
  const d = new Date(dayStart);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime();
}

export function atMinutes(dayStart, minutes) {
  const d = new Date(dayStart);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, minutes).getTime();
}

export function minutesSince(dayStart, ms) {
  return Math.round((ms - dayStart) / MINUTE);
}

export function dayKey(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function clockText(minutes) {
  const m = ((minutes % 1440) + 1440) % 1440;
  const p = (n) => String(n).padStart(2, '0');
  return `${p(Math.floor(m / 60))}:${p(m % 60)}`;
}

export function timeText(ms) {
  const d = new Date(ms);
  return clockText(d.getHours() * 60 + d.getMinutes());
}

/** Times shortly after midnight belong to the previous day for a late sleeper. */
export function normalizeMinutes(minutes, rhythm) {
  return minutes < rhythm.wake - 240 ? minutes + 1440 : minutes;
}

/** Which day a moment belongs to: 01:00 is still "yesterday" until 4 h before usual wake. */
export function activeDay(now, rhythm) {
  const today = startOfDay(now);
  return minutesSince(today, now) < rhythm.wake - 240 ? addDays(today, -1) : today;
}

/** The meal whose usual time is closest, used for "I'm eating now". */
export function likelyMeal(minutes, rhythm) {
  const t = normalizeMinutes(minutes, rhythm);
  return MEALS.reduce((best, meal) => (Math.abs(rhythm[meal] - t) < Math.abs(rhythm[best] - t) ? meal : best), MEALS[0]);
}

// ---------- Medications ----------

export function quantityText(halves) {
  const whole = Math.floor(halves / 2);
  const half = halves % 2 === 1;
  if (whole === 0) return '½';
  return half ? `${whole}½` : `${whole}`;
}

/** Reminder moments a timing creates each day. */
export function anchorsFor(timing) {
  const ordered = (meals) => MEALS.filter((m) => (meals || []).includes(m));
  switch (timing.kind) {
    case 'onWaking':
      return [{ kind: 'waking' }];
    case 'beforeMeals':
      return ordered(timing.meals).map((meal) => ({ kind: 'beforeMeal', meal }));
    case 'afterMeals':
      return ordered(timing.meals).map((meal) => ({ kind: 'afterMeal', meal }));
    case 'atBedtime':
      return [{ kind: 'bedtime' }];
    case 'everyHours': {
      if (!(timing.hours > 0)) return [];
      const out = [];
      for (let m = 0; m < 1440; m += timing.hours * 60) out.push({ kind: 'clock', minutes: timing.start + m });
      return out;
    }
    default:
      return [];
  }
}

export function anchorKey(a) {
  switch (a.kind) {
    case 'beforeMeal':
      return `before-${a.meal}`;
    case 'afterMeal':
      return `after-${a.meal}`;
    case 'clock':
      return `clock-${a.minutes}`;
    default:
      return a.kind;
  }
}

export function anchorTitle(a) {
  switch (a.kind) {
    case 'waking':
      return 'Khi thức dậy';
    case 'beforeMeal':
      return `Trước ${MEAL_NAMES[a.meal]}`;
    case 'afterMeal':
      return `Sau ${MEAL_NAMES[a.meal]}`;
    case 'bedtime':
      return 'Trước khi ngủ';
    case 'clock':
      return `Lúc ${clockText(a.minutes)}`;
    default:
      return '';
  }
}

export function timingSummary(timing) {
  const list = (meals) => {
    const names = MEALS.filter((m) => (meals || []).includes(m)).map((m) => MEAL_NAMES[m]);
    if (names.length === 0) return 'bữa ăn';
    if (names.length === 1) return names[0];
    return `${names.slice(0, -1).join(', ')} và ${names[names.length - 1]}`;
  };
  switch (timing.kind) {
    case 'onWaking':
      return 'khi thức dậy';
    case 'beforeMeals':
      return `trước ${list(timing.meals)}`;
    case 'afterMeals':
      return `sau ${list(timing.meals)}`;
    case 'atBedtime':
      return 'trước khi ngủ';
    case 'everyHours':
      return `cứ ${timing.hours} tiếng một lần, từ ${clockText(timing.start)}`;
    default:
      return 'khi cần';
  }
}

export function daysOfSupplyLeft(med) {
  const perDay = anchorsFor(med.timing).length;
  if (med.remainingHalves == null || perDay === 0) return null;
  return Math.floor(med.remainingHalves / (med.halves * perDay));
}

// ---------- Planning ----------

/** Grouped reminders for the day starting at `day`, earliest first. */
export function plan(day, meds, events, rhythm, settings = DEFAULT_SETTINGS) {
  const groups = new Map();
  for (const med of meds) {
    if (med.active === false) continue;
    for (const anchor of anchorsFor(med.timing)) {
      const key = anchorKey(anchor);
      if (!groups.has(key)) groups.set(key, { anchor, items: [], backup: false });
      const g = groups.get(key);
      g.items.push({ medId: med.id, halves: med.halves });
      if (med.notifyBackup) g.backup = true;
    }
  }
  const dk = dayKey(day);
  const ev = events || {};
  return [...groups.entries()]
    .map(([key, g]) => {
      const [dueAt, fromEvent] = dueDate(g.anchor, day, ev, rhythm, settings);
      return {
        id: `${dk}|${key}`,
        dayKey: dk,
        anchor: g.anchor,
        dueAt,
        missedAt: dueAt + settings.missedAfter * MINUTE,
        items: g.items,
        fromEvent,
        notifiesBackup: g.backup,
      };
    })
    .sort((a, b) => a.dueAt - b.dueAt);
}

function dueDate(anchor, day, ev, rhythm, settings) {
  const started = (meal) => ev.mealStart?.[meal];
  const finished = (meal) => ev.mealEnd?.[meal];
  switch (anchor.kind) {
    case 'waking':
      return ev.wokeAt ? [ev.wokeAt, true] : [atMinutes(day, rhythm.wake), false];
    case 'beforeMeal':
      if (started(anchor.meal)) return [started(anchor.meal), true];
      return [atMinutes(day, rhythm[anchor.meal] - settings.beforeMealLead), false];
    case 'afterMeal': {
      const delay = settings.afterMealDelay * MINUTE;
      if (finished(anchor.meal)) return [finished(anchor.meal), true];
      // Started but not finished: assume a 20-minute meal.
      if (started(anchor.meal)) return [started(anchor.meal) + 20 * MINUTE + delay, true];
      return [atMinutes(day, rhythm[anchor.meal]) + delay, false];
    }
    case 'bedtime':
      return ev.bedAt ? [ev.bedAt, true] : [atMinutes(day, rhythm.bed), false];
    case 'clock':
      return [atMinutes(day, anchor.minutes), false];
    default:
      return [atMinutes(day, 0), false];
  }
}

// ---------- Dose log ----------

export function emptyLog() {
  return { records: [], snoozes: {} };
}

function record(log, dose, outcome, at) {
  const records = log.records.filter((r) => r.doseId !== dose.id);
  for (const item of dose.items) records.push({ doseId: dose.id, medId: item.medId, outcome, at });
  const snoozes = { ...log.snoozes };
  delete snoozes[dose.id];
  return { records, snoozes };
}

export const markTaken = (log, dose, at) => record(log, dose, 'taken', at);
export const markSkipped = (log, dose, at) => record(log, dose, 'skipped', at);

export function snooze(log, dose, until) {
  return { ...log, snoozes: { ...log.snoozes, [dose.id]: until } };
}

export function effectiveDueAt(log, dose) {
  const s = log.snoozes[dose.id];
  return s ? Math.max(dose.dueAt, s) : dose.dueAt;
}

export function status(log, dose, now) {
  const handled = log.records.filter((r) => r.doseId === dose.id);
  if (handled.length) {
    const taken = handled.filter((r) => r.outcome === 'taken');
    if (taken.length) return { kind: 'taken', at: Math.max(...taken.map((r) => r.at)) };
    return { kind: 'skipped' };
  }
  const s = log.snoozes[dose.id];
  if (s && now < s) return { kind: 'snoozed', until: s };
  if (now < dose.dueAt) return { kind: 'upcoming' };
  const missedAt = dose.missedAt + (effectiveDueAt(log, dose) - dose.dueAt);
  return now < missedAt ? { kind: 'due' } : { kind: 'missed' };
}

export const isHandled = (st) => st.kind === 'taken' || st.kind === 'skipped';

export function pruneLog(log, before) {
  return { ...log, records: log.records.filter((r) => r.at >= before) };
}

/**
 * Notifications to hand the reminder server: first nudge, repeats, then Que's own missed alert.
 * Titles and bodies never name a medicine, so the server learns only times.
 */
export function notificationItems(doses, log, settings, now) {
  const items = [];
  for (const dose of doses) {
    if (isHandled(status(log, dose, now))) continue;
    const due = effectiveDueAt(log, dose);
    const shift = due - dose.dueAt;
    const halves = dose.items.reduce((sum, i) => sum + i.halves, 0);
    const title = anchorTitle(dose.anchor);
    const url = `./#/dose/${encodeURIComponent(dose.id)}`;
    const add = (kind, at, t, body) => {
      if (at > now) items.push({ id: `${dose.id}#${kind}@${at}`, at, title: t, body, url });
    };
    add('due', due, 'Đến giờ uống thuốc', `${title} · ${quantityText(Math.max(1, halves))} viên`);
    for (const offset of settings.renudge) {
      add(`re${offset}`, due + offset * MINUTE, `Nhắc lại: ${title.toLowerCase()}`, 'Bấm để xem và đánh dấu đã uống.');
    }
    add(
      'missed',
      dose.missedAt + shift,
      'Chưa thấy xác nhận uống thuốc',
      `Thuốc ${title.toLowerCase()} chưa được đánh dấu. Nếu đã uống, mở Cinnamon và bấm "Đã uống".`,
    );
  }
  return items.sort((a, b) => a.at - b.at);
}

// ---------- Outdoors ----------

/** NOAA heat index in °C (Rothfusz regression with its adjustments). */
export function heatIndexC(tempC, rh) {
  if (tempC == null) return null;
  if (rh == null) return tempC;
  const t = (tempC * 9) / 5 + 32;
  let hi = 0.5 * (t + 61 + (t - 68) * 1.2 + rh * 0.094);
  if ((hi + t) / 2 >= 80) {
    hi =
      -42.379 + 2.04901523 * t + 10.14333127 * rh - 0.22475541 * t * rh - 0.00683783 * t * t -
      0.05481717 * rh * rh + 0.00122874 * t * t * rh + 0.00085282 * t * rh * rh - 0.00000199 * t * t * rh * rh;
    if (rh < 13 && t >= 80 && t <= 112) hi -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(t - 95)) / 17);
    else if (rh > 85 && t >= 80 && t <= 87) hi += ((rh - 85) / 10) * ((87 - t) / 5);
  }
  return ((hi - 32) * 5) / 9;
}

export const RISK = { good: 0, caution: 1, danger: 2 };

export function assessHour(hour, th = DEFAULT_THRESHOLDS) {
  let risk = RISK.good;
  const factors = new Set();
  const raise = (level, factor) => {
    if (level > RISK.good) {
      factors.add(factor);
      risk = Math.max(risk, level);
    }
  };
  if (hour.aqi != null) raise(hour.aqi >= th.aqiDanger ? 2 : hour.aqi >= th.aqiCaution ? 1 : 0, 'air');
  if (hour.uv != null) raise(hour.uv >= th.uvCaution ? 1 : 0, 'sun');
  const heat = heatIndexC(hour.tempC, hour.rh);
  if (heat != null) raise(heat >= th.heatDanger ? 2 : heat >= th.heatCaution ? 1 : 0, 'heat');
  return { ...hour, heat, risk, factors };
}

function longestRun(hours, predicate) {
  let best = null;
  let cur = null;
  for (const h of hours) {
    if (predicate(h)) {
      cur = cur && cur.end === h.time ? { start: cur.start, end: h.time + HOUR } : { start: h.time, end: h.time + HOUR };
      if (!best || cur.end - cur.start > best.end - best.start) best = { ...cur };
    } else {
      cur = null;
    }
  }
  return best;
}

/** Outlook for the hours in [start, end): best window, worst risk, heat danger. */
export function outlook(forecast, start, end, th = DEFAULT_THRESHOLDS) {
  const hours = forecast
    .filter((h) => h.time + HOUR > start && h.time < end)
    .sort((a, b) => a.time - b.time)
    .map((h) => assessHour(h, th));
  const worst = hours.reduce((m, h) => Math.max(m, h.risk), 0);
  const floor = hours.length ? Math.min(...hours.map((h) => h.risk)) : null;
  const best = floor != null && floor < RISK.danger ? longestRun(hours, (h) => h.risk === floor) : null;
  const worstFactors = new Set();
  for (const h of hours) if (h.risk === worst) h.factors.forEach((f) => worstFactors.add(f));
  return {
    hours,
    bestWindow: best,
    bestRisk: best ? floor : null,
    worstRisk: worst,
    worstFactors,
    severeAir: hours.some((h) => (h.aqi ?? 0) >= th.aqiSevere),
    heatDanger: longestRun(hours, (h) => (h.heat ?? 0) >= th.heatDanger),
    stayIn: hours.length > 0 && !best,
  };
}

export function walkingLimit(risk, energy) {
  let base = risk === RISK.good ? 15 : risk === RISK.caution ? 5 : 0;
  if (energy === 'low') base = Math.floor(base / 2);
  if (energy === 'veryLow') base = 0;
  return base;
}

/** Rounded to a 0.05° grid (about 5 km) before any request leaves the phone. */
export function coarsen({ lat, lon }) {
  const r = (v) => Math.round(v / 0.05) * 0.05;
  return { lat: Number(r(lat).toFixed(2)), lon: Number(r(lon).toFixed(2)) };
}

/** Merge Open-Meteo air-quality and weather responses (requested with timeformat=unixtime). */
export function parseOpenMeteo(air, weather) {
  const byTime = new Map();
  const get = (t) => {
    const time = t * 1000;
    if (!byTime.has(time)) byTime.set(time, { time, aqi: null, uv: null, tempC: null, rh: null });
    return byTime.get(time);
  };
  (air?.hourly?.time || []).forEach((t, i) => {
    const h = get(t);
    const aqi = air.hourly.us_aqi?.[i];
    h.aqi = aqi == null ? null : Math.round(aqi);
    h.uv = air.hourly.uv_index?.[i] ?? null;
  });
  (weather?.hourly?.time || []).forEach((t, i) => {
    const h = get(t);
    h.tempC = weather.hourly.temperature_2m?.[i] ?? null;
    h.rh = weather.hourly.relative_humidity_2m?.[i] ?? null;
  });
  return [...byTime.values()].sort((a, b) => a.time - b.time);
}

// ---------- Check-in ----------

export const NORMAL_DAY = {
  maxSuggestions: 3,
  energy: null,
  indoorOnly: false,
  pauseNudges: false,
  holdRoutineShift: false,
  afternoonRest: false,
};

export function adjustments(checkIn) {
  if (!checkIn) return NORMAL_DAY;
  if (checkIn.energy === 'veryLow') {
    return { maxSuggestions: 1, energy: 'veryLow', indoorOnly: true, pauseNudges: true, holdRoutineShift: true, afternoonRest: true };
  }
  if (checkIn.sleep === 'poor' || checkIn.energy === 'low') {
    return { maxSuggestions: 2, energy: checkIn.energy, indoorOnly: false, pauseNudges: false, holdRoutineShift: true, afternoonRest: true };
  }
  return { ...NORMAL_DAY, energy: checkIn.energy };
}

/** Bad sleep or very low energy on 5 of the last 7 days → suggest telling her doctor. */
export function shouldSuggestDoctor(checkIns, now) {
  const weekAgo = now - 7 * 24 * HOUR;
  const days = new Set(
    checkIns.filter((c) => c.at > weekAgo && (c.sleep === 'poor' || c.energy === 'veryLow')).map((c) => c.dayKey),
  );
  return days.size >= 5;
}
