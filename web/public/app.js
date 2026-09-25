// Cinnamon web trial: the same flows as the iOS app, in the browser.
// Data lives in this phone's browser storage; only reminder times go to the reminder server.
import * as core from './core.js';
import * as companion from './companion.js';

const KEY = 'cinnamon';
const MIN = 60_000;
const app = document.getElementById('app');
const HANOI = { lat: 21.03, lon: 105.85, approx: true };

// ---------- State ----------

function freshState() {
  return {
    version: 1,
    onboarded: false,
    rhythm: { ...core.DEFAULT_RHYTHM },
    settings: { ...core.DEFAULT_SETTINGS },
    thresholds: { ...core.DEFAULT_THRESHOLDS },
    meds: [],
    log: core.emptyLog(),
    events: {},
    checkIns: [],
    home: null,
    fluidLimitMl: null,
    deviceId: crypto.randomUUID(),
    push: { enabled: false, lastSync: null },
    forecast: null,
    profile: { conditions: [], saltG: null, proteinG: null },
    chat: [],
    activities: [],
  };
}

function load() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved && saved.version === 1) return { ...freshState(), ...saved };
  } catch {
    /* start fresh */
  }
  return freshState();
}

let state = load();

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    toast('Không lưu được dữ liệu trên máy.');
  }
}

function commit({ rerender = true } = {}) {
  state.log = core.pruneLog(state.log, Date.now() - 60 * 24 * 60 * MIN);
  save();
  scheduleSync();
  if (rerender) render();
}

// ---------- Helpers ----------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const now = () => Date.now();
const today = () => core.activeDay(now(), state.rhythm);
const todayKey = () => core.dayKey(today());
const eventsFor = (key) => state.events[key] || {};
const dosesOn = (day) => core.plan(day, state.meds, eventsFor(core.dayKey(day)), state.rhythm, state.settings);
const todaysDoses = () => dosesOn(today());
const statusOf = (dose) => core.status(state.log, dose, now());
const medById = (id) => state.meds.find((m) => m.id === id);
const medName = (m) => (m ? (m.strength ? `${m.name} ${m.strength}` : m.name) : 'Thuốc');
const totalHalves = (dose) => dose.items.reduce((n, i) => n + i.halves, 0);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const todaysCheckIn = () => state.checkIns.find((c) => c.dayKey === todayKey());
const dayAdjust = () => core.adjustments(todaysCheckIn());

function findDose(id) {
  const t = today();
  return [...dosesOn(core.addDays(t, -1)), ...dosesOn(t)].find((d) => d.id === id);
}

function nextDose() {
  return todaysDoses().find((d) => !core.isHandled(statusOf(d)));
}

function go(path) {
  location.hash = `#/${path}`;
}

function toast(message) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    el.setAttribute('role', 'status');
    el.style.cssText =
      'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom) + 24px);transform:translateX(-50%);background:#2B1810;color:#FAF3E8;padding:14px 20px;border-radius:999px;font-size:17px;font-weight:600;z-index:10;max-width:90vw;text-align:center';
    document.body.append(el);
  }
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => (el.hidden = true), 3500);
}

const toMinutes = (value) => {
  const [h, m] = String(value).split(':').map(Number);
  return h * 60 + (m || 0);
};

// ---------- Icons ----------

function spiralPath(turns = 2.6) {
  let d = '';
  for (let i = 0; i <= 120; i++) {
    const t = i / 120;
    const a = t * turns * 2 * Math.PI;
    const r = 11 * t;
    d += `${i ? 'L' : 'M'}${(12 + r * Math.cos(a)).toFixed(2)} ${(12 + r * Math.sin(a)).toFixed(2)}`;
  }
  return d;
}
const SPIRAL = spiralPath();

function starPoints() {
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    const r = i % 2 === 0 ? 11 : 4.4;
    pts.push(`${(12 + r * Math.cos(a)).toFixed(2)},${(12 + r * Math.sin(a)).toFixed(2)}`);
  }
  return pts.join(' ');
}
const STAR = starPoints();

const icon = {
  spiral: (color = '#E8A15C', width = 2.2, cls = '') =>
    `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round"><path d="${SPIRAL}"/></svg>`,
  star: (color = '#2F6B5A', size = 28) => `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><polygon points="${STAR}" fill="${color}"/></svg>`,
  path: (d, size = 24, width = 2.2) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`,
};
const ICONS = {
  back: '<path d="M15 18l-6-6 6-6"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  check: '<path d="M20 6 9 17l-5-5"/>',
  camera: '<path d="M4 7h3l2-3h6l2 3h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
  mic: '<path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z"/><path d="M19 11a7 7 0 0 1-14 0"/><path d="M12 18v3"/>',
  speaker: '<path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/>',
  pill: '<path d="M10.5 20.5a4.95 4.95 0 0 1-7-7l7-7a4.95 4.95 0 0 1 7 7z"/><path d="m8.5 8.5 7 7"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  send: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  play: '<path d="M8 5v14l11-7z"/>',
  pin: '<path d="M12 21s-7-6.2-7-11a7 7 0 0 1 14 0c0 4.8-7 11-7 11z"/><circle cx="12" cy="10" r="2.5"/>',
};
const svg = (name, size, width) => icon.path(ICONS[name], size, width);

function battery(level, color) {
  const bars = { good: 3, low: 2, veryLow: 1 }[level];
  let rects = '';
  for (let i = 0; i < 3; i++) rects += `<rect x="${5 + i * 9}" y="7" width="8" height="10" rx="2" fill="${i < bars ? color : 'none'}"/>`;
  return `<svg viewBox="0 0 40 24" width="40" height="24" aria-hidden="true" fill="none"><rect x="1" y="3" width="34" height="18" rx="5" stroke="${color}" stroke-width="2"/><rect x="36" y="9" width="3" height="6" rx="1.5" fill="${color}"/>${rects}</svg>`;
}

const photoTag = (m, size = 64) =>
  m?.photo
    ? `<img class="photo" src="${esc(m.photo)}" alt="" style="width:${size}px;height:${size}px">`
    : `<span class="photo" style="width:${size}px;height:${size}px">${svg('pill', Math.round(size * 0.42))}</span>`;

const header = (title, back = 'home') => `
  <div class="row">
    <a class="btn btn-icon" href="#/${back}" aria-label="Quay lại">${svg('back')}</a>
    <h2 class="grow" style="font-size:24px">${esc(title)}</h2>
  </div>`;

// ---------- Views ----------

function greeting() {
  const h = new Date().getHours();
  if (h >= 4 && h < 11) return 'Chào buổi sáng!';
  if (h >= 11 && h < 14) return 'Chào buổi trưa!';
  if (h >= 14 && h < 18) return 'Chào buổi chiều!';
  return 'Chào buổi tối!';
}

let welcomeDraft = null;

function viewWelcome() {
  welcomeDraft ||= { rhythm: { ...state.rhythm }, home: state.home };
  const r = welcomeDraft.rhythm;
  const timeRow = (key, label) => `
    <label class="row between" style="min-height:60px;padding:0 6px">
      <span style="font-weight:600">${label}</span>
      <input type="time" value="${core.clockText(r[key])}" data-bind="welcome.${key}">
    </label>`;
  return `
    <div class="badge" style="width:64px;height:64px">${icon.spiral('#E8A15C', 2.2)}</div>
    <h1 style="font-size:36px">Chào mừng đến với Cinnamon</h1>
    <p style="color:var(--body)">Cho Cinnamon biết một ngày bình thường của bạn, để nhắc thuốc đúng lúc bạn ăn và ngủ.</p>
    <div class="card" style="gap:0;padding:8px 12px">
      ${timeRow('wake', 'Thức dậy')}
      ${timeRow('breakfast', 'Bữa sáng')}
      ${timeRow('lunch', 'Bữa trưa')}
      ${timeRow('dinner', 'Bữa tối')}
      ${timeRow('bed', 'Đi ngủ')}
    </div>
    <div class="stack">
      <div class="eyebrow">Khu vực nhà bạn</div>
      ${locationControls('welcome', welcomeDraft.home)}
    </div>
    <button class="btn-block" data-act="finishWelcome">Bắt đầu</button>`;
}

function viewHome() {
  const dose = nextDose();
  const refill = state.meds.filter((m) => {
    const days = core.daysOfSupplyLeft(m);
    return days != null && days <= 5;
  });
  const needsPush = !state.push.enabled;
  return `
    <div class="row">
      <div class="badge">${icon.spiral()}</div>
      <span class="wordmark grow">Cinnamon</span>
      <a class="btn btn-chip" href="#/meds">${svg('pill', 20)} Thuốc</a>
      <a class="btn btn-icon" href="#/settings" aria-label="Cài đặt">${svg('gear', 22, 2)}</a>
    </div>
    <h1 style="font-size:38px;margin-top:4px">${greeting()}</h1>
    ${needsPush ? `<a class="card honey notice" href="#/settings" style="text-decoration:none"><strong>Bật nhắc thuốc</strong><span>Để Cinnamon gửi thông báo cả khi đang đóng ứng dụng. Bấm vào đây.</span></a>` : ''}
    ${core.shouldSuggestDoctor(state.checkIns, now()) ? `<div class="card honey notice">Tuần này bạn hay mệt hoặc ngủ không ngon. Nên kể với bác sĩ trong lần khám tới nhé.</div>` : ''}
    ${doseCard(dose)}
    ${demoBanner()}
    ${outdoorCard()}
    ${refill.map((m) => `<div class="card chai notice">${esc(medName(m))} còn khoảng ${core.daysOfSupplyLeft(m)} ngày. Nhớ mua thêm nhé.</div>`).join('')}
    ${activityCard()}
    <div class="spacer"></div>
    <a class="btn btn-ink btn-block" href="#/chat" style="min-height:76px;justify-content:flex-start;padding:0 20px 0 22px">
      <span style="width:28px;height:28px;display:inline-block">${icon.spiral('#E8A15C', 2.2)}</span>
      <span class="grow" style="text-align:left;display:flex;flex-direction:column;line-height:1.25">Hỏi Cinnamon<span style="font-weight:500;font-size:15px;color:var(--chai)">Nấu ăn · Giãn cơ · Tập nhẹ</span></span>
      ${svg('chevron', 22)}
    </a>`;
}

const doneToday = () => state.activities.filter((a) => a.dayKey === todayKey());

/** One short routine to try today, with why it helps; or a well-done note once she has moved. */
function activityCard() {
  const done = doneToday();
  if (done.length) {
    const minutes = done.reduce((n, a) => n + a.minutes, 0);
    return `<div class="card jade notice row">${icon.star('#2F6B5A', 26)}<span class="grow">Hôm nay bạn đã vận động ${minutes} phút. Giỏi lắm!</span></div>`;
  }
  const r = companion.routinesFor(dayAdjust().energy)[0];
  return routineCard(r, 'Vận động hôm nay');
}

function routineCard(r, eyebrow = '') {
  return `<a class="card routine-card" href="#/routine/${r.id}">
      ${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}
      <div class="row" style="align-items:flex-start">
        <span class="minutes"><b>${r.minutes}</b>phút</span>
        <span class="grow stack" style="gap:2px"><strong style="font-size:20px">${esc(r.title)}</strong><span class="small" style="color:var(--body)">${esc(r.why.split('. ')[0])}.</span></span>
        <span style="color:var(--cinnamon);align-self:center">${svg('chevron', 22)}</span>
      </div>
    </a>`;
}

function doseCard(dose) {
  if (!state.meds.length) {
    return `
      <section class="hero">
        <svg class="watermark" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#E8A15C" stroke-width="0.8"><path d="${SPIRAL}"/></svg>
        <div class="eyebrow">Chưa có thuốc</div>
        <h2 style="font-size:30px">Thêm thuốc đầu tiên</h2>
        <p class="sub">Chụp ảnh hộp thuốc, rồi trả lời hai câu hỏi.</p>
        <a class="btn btn-caramel btn-block" href="#/add">Thêm thuốc</a>
      </section>`;
  }
  if (!dose) {
    return `
      <section class="card jade row">
        ${icon.star('#2F6B5A', 40)}
        <div><h2 style="font-size:26px">Xong thuốc hôm nay</h2><p class="muted">Tốt lắm. Hẹn gặp lại ngày mai.</p></div>
      </section>`;
  }
  const st = statusOf(dose);
  const eyebrow =
    st.kind === 'due' ? 'Đến giờ uống thuốc'
    : st.kind === 'missed' ? 'Chưa uống'
    : st.kind === 'snoozed' ? `Nhắc lại lúc ${core.timeText(st.until)}`
    : `Thuốc tiếp theo · ${core.timeText(dose.dueAt)}`;
  const names = dose.items.map((i) => esc(medName(medById(i.medId)))).join(', ');
  const a = dose.anchor;
  let action = `<a class="btn btn-caramel btn-block" href="#/dose/${encodeURIComponent(dose.id)}">Xem và uống</a>`;
  if (st.kind === 'upcoming' && a.kind === 'beforeMeal') {
    action = `<button class="btn-caramel btn-block" data-act="startMeal" data-meal="${a.meal}" data-open="before">Tôi sắp ăn ${core.MEAL_NAMES[a.meal]}</button>`;
  } else if (st.kind === 'upcoming' && a.kind === 'afterMeal') {
    action = eventsFor(todayKey()).mealStart?.[a.meal]
      ? `<button class="btn-caramel btn-block" data-act="finishMeal" data-meal="${a.meal}">Tôi ăn xong rồi</button>`
      : `<button class="btn-caramel btn-block" data-act="startMeal" data-meal="${a.meal}">Tôi đang ăn ${core.MEAL_NAMES[a.meal]}</button>`;
  }
  return `
    <section class="hero">
      <svg class="watermark" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#E8A15C" stroke-width="0.8"><path d="${SPIRAL}"/></svg>
      <div class="eyebrow">${eyebrow}</div>
      <h2 style="font-size:32px">${core.anchorTitle(a)}</h2>
      <p class="sub">${core.quantityText(Math.max(1, totalHalves(dose)))} viên · ${names}</p>
      ${action}
    </section>`;
}

// ---------- Outdoors ----------

let forecastLoading = false;

async function refreshForecast(force = false) {
  const home = state.home || HANOI;
  const fresh = state.forecast && now() - state.forecast.fetchedAt < 30 * MIN;
  if ((fresh && !force) || forecastLoading) return;
  forecastLoading = true;
  try {
    const c = core.coarsen(home);
    const q = `latitude=${c.lat}&longitude=${c.lon}&timeformat=unixtime&forecast_days=2`;
    const [air, weather] = await Promise.all([
      fetch(`https://air-quality-api.open-meteo.com/v1/air-quality?${q}&hourly=us_aqi,uv_index`).then((r) => r.json()),
      fetch(`https://api.open-meteo.com/v1/forecast?${q}&hourly=temperature_2m,relative_humidity_2m`).then((r) => r.json()),
    ]);
    state.forecast = { fetchedAt: now(), hours: core.parseOpenMeteo(air, weather), error: null };
  } catch {
    state.forecast = { ...(state.forecast || { hours: [] }), error: 'Chưa tải được thời tiết. Kiểm tra kết nối mạng.' };
  }
  forecastLoading = false;
  save();
  const r = route().name;
  if (r === 'home' || r === 'outdoor') render();
}

/** Sample forecasts for trying the bad-day screens from anywhere. */
function demoHours(kind) {
  const start = Math.floor(now() / 3600e3) * 3600e3 - 3 * 3600e3;
  const hours = [];
  for (let i = 0; i < 51; i++) {
    const time = start + i * 3600e3;
    const h = new Date(time).getHours();
    const daytime = h >= 7 && h <= 17;
    if (kind === 'smog') hours.push({ time, aqi: 165, uv: daytime ? 4 : 0, tempC: 27, rh: 60 });
    else hours.push({ time, aqi: h >= 19 ? 70 : 42, uv: daytime ? (h >= 10 && h <= 15 ? 8 : 3) : 0, tempC: h >= 11 && h <= 16 ? 36 : 28, rh: 65 });
  }
  return hours;
}

const forecastHours = () => (state.demo ? demoHours(state.demo) : state.forecast?.hours || []);

const demoBanner = () =>
  state.demo ? `<a class="card honey notice" href="#/settings" style="text-decoration:none">Đang xem dữ liệu mẫu (${state.demo === 'smog' ? 'không khí xấu' : 'nắng nóng'}). Tắt trong Cài đặt.</a>` : '';

function currentOutlook() {
  const hours = forecastHours();
  if (!hours.length) return null;
  // After this evening's waking hours, look at tomorrow's instead.
  for (const day of [today(), core.addDays(today(), 1)]) {
    const start = Math.max(now(), core.atMinutes(day, state.rhythm.wake));
    const end = core.atMinutes(day, state.rhythm.dinner + 60);
    if (start < end) return core.outlook(hours, start, end, state.thresholds);
  }
  return null;
}

function currentHour() {
  const hours = forecastHours();
  const h = [...hours].reverse().find((x) => x.time <= now());
  return h ? core.assessHour(h, state.thresholds) : null;
}

function headline(o) {
  if (!o) return state.forecast?.error ? 'Chưa có dữ liệu' : 'Đang tải…';
  if (!o.bestWindow) return 'Nên ở nhà';
  if (o.bestWindow.start <= now()) return 'Bây giờ';
  const tomorrow = core.startOfDay(o.bestWindow.start) > core.startOfDay(now());
  return `${tomorrow ? 'Mai, sau' : 'Sau'} ${core.timeText(o.bestWindow.start)}`;
}

function chips(h) {
  if (!h) return '';
  const chip = (label, value, factor) => {
    const flagged = h.factors.has(factor);
    const cls = flagged && h.risk === core.RISK.danger ? 'danger' : flagged ? 'caution' : '';
    return `<div class="chip ${cls}"><div class="k">${label}</div><div class="v">${value}</div></div>`;
  };
  return `<div class="chips">
    ${chip('Không khí', h.aqi ?? '–', 'air')}
    ${chip('Nắng (UV)', h.uv != null ? Math.round(h.uv) : '–', 'sun')}
    ${chip('Cảm giác', h.heat != null ? `${Math.round(h.heat)}°C` : '–', 'heat')}
  </div>`;
}

function outdoorCard() {
  const o = currentOutlook();
  return `
    <a class="card" href="#/outdoor" style="text-decoration:none;color:inherit">
      <div class="row">
        <div class="grow">
          <div class="eyebrow">${o?.stayIn ? 'Hôm nay' : 'Giờ tốt để ra ngoài'}</div>
          <h2>${headline(o)}</h2>
        </div>
        <span class="btn btn-icon">${svg('chevron')}</span>
      </div>
      ${chips(currentHour())}
      ${state.forecast?.error ? `<p class="small muted">${esc(state.forecast.error)}</p>` : ''}
    </a>`;
}

function viewOutdoor() {
  const o = currentOutlook();
  const adj = dayAdjust();
  if (!o) {
    return `${header('Bên ngoài hôm nay')}${demoBanner()}<p>${state.forecast?.error ? esc(state.forecast.error) : 'Đang tải thời tiết…'}</p>`;
  }
  const walking = core.walkingLimit(adj.indoorOnly ? core.RISK.danger : o.bestRisk ?? core.RISK.danger, adj.energy);
  const air = o.worstFactors.has('air');
  const top =
    o.stayIn || o.severeAir
      ? `<section class="hero danger-hero">
          <div class="eyebrow">${air ? 'Không khí xấu' : 'Nóng nguy hiểm'}</div>
          <h2 style="font-size:36px">Hôm nay ở nhà nhé</h2>
          <p class="sub">${air ? 'Đóng cửa sổ và cửa ra vào.' : 'Ở phòng mát nhất trong nhà.'}</p>
          ${air ? '<p style="font-weight:600">Nếu phải ra ngoài: đeo khẩu trang N95 hoặc KF94.</p>' : ''}
        </section>`
      : `<h1>${headline(o)}</h1>`;
  const bestHours = o.hours.filter((h) => o.bestWindow && h.time >= o.bestWindow.start && h.time < o.bestWindow.end);
  const sunny = o.worstFactors.has('sun') || bestHours.some((h) => h.factors.has('sun'));
  const advice = [
    walking === 0 ? 'Hôm nay không nên đi bộ ngoài trời.' : `Đi bộ tối đa ${walking} phút, chọn đường có bóng râm.`,
    sunny ? 'Đội mũ, mặc áo dài tay, bôi kem chống nắng.' : '',
    bestHours.some((h) => h.factors.has('air')) ? 'Tránh đường đông xe.' : '',
  ].filter(Boolean).join(' ');
  const fluids =
    state.fluidLimitMl != null
      ? `Giới hạn nước của bạn: ${state.fluidLimitMl} ml mỗi ngày. Làm mát bằng quạt và khăn ướt thay vì uống thêm.`
      : 'Nhớ uống nước từng ngụm nhỏ. Hỏi bác sĩ về lượng nước nên uống khi trời nóng.';
  const bar = o.hours
    .map((h) => {
      const best = o.bestWindow && h.time >= o.bestWindow.start && h.time < o.bestWindow.end;
      const cls = best ? 'best' : h.risk === 2 ? 'danger' : h.risk === 1 ? 'caution' : '';
      return `<span class="${cls}" title="${core.timeText(h.time)}"></span>`;
    })
    .join('');
  const first = o.hours[0];
  const last = o.hours[o.hours.length - 1];
  return `
    ${header('Bên ngoài hôm nay')}
    ${demoBanner()}
    ${top}
    <section class="card">
      <div class="eyebrow">Hôm nay</div>
      <div class="daybar" role="img" aria-label="Thời điểm tốt nhất để ra ngoài">${bar}</div>
      <div class="row between small muted"><span>${first ? core.timeText(first.time) : ''}</span><span>${last ? core.timeText(last.time + 60 * MIN) : ''}</span></div>
      ${o.bestWindow ? `<div class="card jade row" style="padding:12px">${icon.star('#2F6B5A', 24)}<strong style="color:var(--jade-deep)">Tốt nhất: ${core.timeText(o.bestWindow.start)} – ${core.timeText(o.bestWindow.end)}</strong></div>` : ''}
    </section>
    ${chips(currentHour())}
    ${o.stayIn ? '' : `<section class="card chai"><div class="eyebrow" style="color:var(--bark)">Khi ra ngoài</div><p>${advice}</p></section>`}
    ${o.heatDanger ? `<section class="card chili"><strong style="color:var(--chili-deep)">Nóng nguy hiểm ${core.timeText(o.heatDanger.start)} – ${core.timeText(o.heatDanger.end)}</strong><p>Lúc này nên bật điều hoà. Để 27–28°C và bật thêm quạt cho đỡ tốn điện. Ở phòng mát nhất, lau người bằng khăn mát.</p><p class="muted">${fluids}</p></section>` : ''}
    ${o.stayIn || adj.indoorOnly ? indoorIdeas() : ''}
    <p class="small muted">${state.demo ? 'Dữ liệu mẫu, không phải thời tiết thật.' : `Nguồn: Open-Meteo${state.home?.label ? ` · ${esc(state.home.label)}` : ''} · cập nhật ${state.forecast?.fetchedAt ? core.timeText(state.forecast.fetchedAt) : '—'}`}</p>`;
}

function indoorIdeas() {
  const cook = 'Hôm nay tôi ở nhà. Gợi ý một món ăn ít muối, nấu nhanh, không phải đứng bếp lâu.';
  const ideas = [
    ['Giãn cơ nhẹ', '5 phút', 'href="#/routine/stretch"'],
    ['Nấu một món ít muối', 'Hỏi Cinnamon', `href="#/chat" data-act="ask" data-text="${esc(cook)}"`],
    ['Tập thở chậm', '4 phút', 'href="#/routine/breathe"'],
  ];
  return `<div class="eyebrow">Ở nhà hôm nay</div>${ideas
    .map(([t, m, attrs]) => `<a class="card row" ${attrs} style="padding:14px 18px;text-decoration:none;color:inherit"><strong class="grow">${t}</strong><span class="muted">${m}</span>${svg('chevron', 20)}</a>`)
    .join('')}`;
}

// ---------- Dose ----------

function viewDose(id) {
  const dose = findDose(id);
  if (!dose) return `${header('Thuốc')}<p>Không tìm thấy lần uống thuốc này.</p>`;
  const st = statusOf(dose);
  const items = dose.items
    .map((i) => {
      const m = medById(i.medId);
      return `<div class="card row" style="padding:12px 16px 12px 12px">${photoTag(m)}<strong class="grow" style="font-size:21px">${esc(medName(m))}</strong><span class="qty">×${core.quantityText(i.halves)}</span></div>`;
    })
    .join('');
  const handled = core.isHandled(st);
  return `
    <section class="hero" style="margin:-16px -20px 0;border-radius:0 0 36px 36px;padding:28px 24px">
      <svg class="watermark" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="#E8A15C" stroke-width="0.8" style="top:auto;bottom:-110px;right:-90px"><path d="${SPIRAL}"/></svg>
      <div class="row"><a class="btn btn-icon" href="#/home" aria-label="Quay lại" style="background:rgba(250,243,232,.14);color:var(--cream)">${svg('back')}</a></div>
      <div class="eyebrow">${st.kind === 'missed' ? 'Chưa uống' : st.kind === 'taken' ? `Đã uống lúc ${core.timeText(st.at)}` : 'Đến giờ uống thuốc'}</div>
      <h1 style="font-size:44px">${core.anchorTitle(dose.anchor)}</h1>
      <p class="sub">${core.quantityText(Math.max(1, totalHalves(dose)))} viên${dose.items.length > 1 ? ', uống cùng lúc' : ''}</p>
    </section>
    <div class="stack">${items}</div>
    <div class="spacer"></div>
    ${
      handled
        ? `<a class="btn btn-soft btn-block" href="#/home">Về trang chính</a>`
        : `<button class="btn-jade btn-block" data-act="taken" data-id="${esc(dose.id)}">${svg('check', 28, 2.6)} Đã uống</button>
           <div class="grid2">
             <button class="btn-soft" data-act="snooze" data-id="${esc(dose.id)}" data-min="${state.settings.snooze}">Nhắc lại 15 phút</button>
             ${dose.anchor.kind === 'beforeMeal' ? `<button class="btn-soft" data-act="snooze" data-id="${esc(dose.id)}" data-min="30">Tôi chưa ăn</button>` : ''}
           </div>
           <button class="btn-link" data-act="skip" data-id="${esc(dose.id)}">Bỏ qua liều này</button>`
    }`;
}

// ---------- Check-in ----------

let checkinDraft = { sleep: null, energy: null };

function viewCheckin() {
  const sleepOpts = [['good', 'Ngủ ngon'], ['okay', 'Bình thường'], ['poor', 'Ngủ không ngon']];
  const energyOpts = [['good', 'Khoẻ', '#2F6B5A'], ['low', 'Hơi mệt', '#A2532A'], ['veryLow', 'Rất mệt', '#B3261E']];
  return `
    <div class="row between">
      <div class="row" style="background:var(--chai);border-radius:999px;padding:6px 14px 6px 6px;gap:10px">
        <span class="badge" style="width:32px;height:32px">${icon.spiral('#E8A15C', 2.4)}</span>
        <strong style="font-size:16px;color:var(--bark)">Hỏi thăm buổi sáng</strong>
      </div>
      <button class="btn-link" data-act="skipCheckin">Bỏ qua</button>
    </div>
    <h1>Đêm qua ngủ thế nào?</h1>
    <div class="stack">
      ${sleepOpts.map(([v, l]) => `<button class="choice" style="justify-content:flex-start;padding:0 24px" aria-pressed="${checkinDraft.sleep === v}" data-act="pickSleep" data-v="${v}">${l}</button>`).join('')}
    </div>
    <h1>Hôm nay thấy sức thế nào?</h1>
    <div class="grid3">
      ${energyOpts.map(([v, l, c]) => `<button class="choice tall" aria-pressed="${checkinDraft.energy === v}" data-act="pickEnergy" data-v="${v}">${battery(v, checkinDraft.energy === v ? '#E8A15C' : c)}${l}</button>`).join('')}
    </div>
    <div class="spacer"></div>
    <button class="btn-block" data-act="saveCheckin" ${checkinDraft.sleep || checkinDraft.energy ? '' : 'disabled'}>Xong</button>`;
}

// ---------- Medications ----------

function viewMeds() {
  const list = state.meds
    .map(
      (m) => `
      <a class="card row" href="#/edit/${encodeURIComponent(m.id)}" style="text-decoration:none;color:inherit;padding:12px">
        ${photoTag(m, 56)}
        <div class="grow"><strong style="font-size:20px">${esc(medName(m))}</strong><div class="small muted">${core.quantityText(m.halves)} viên, ${core.timingSummary(m.timing)}</div></div>
        ${svg('chevron')}
      </a>`,
    )
    .join('');
  return `${header('Thuốc của tôi')}${list || '<p class="muted">Chưa có thuốc nào.</p>'}<a class="btn btn-block" href="#/add">Thêm thuốc</a>`;
}

let draft = null;

function startDraft(existing) {
  if (existing) {
    draft = {
      ...existing,
      timing: { hours: 12, start: 480, meals: [], ...existing.timing, meals: [...(existing.timing.meals || [])] },
      remaining: existing.remainingHalves != null ? String(existing.remainingHalves / 2) : '',
      step: 0,
      isNew: false,
    };
  } else {
    draft = { id: crypto.randomUUID(), name: '', strength: '', photo: null, halves: 2, timing: { kind: null, meals: [], hours: 12, start: 480 }, notifyBackup: false, remaining: '', active: true, step: 0, isNew: true };
  }
}

const TIMING_KINDS = [
  ['onWaking', 'Khi thức dậy'],
  ['beforeMeals', 'Trước bữa ăn'],
  ['afterMeals', 'Sau bữa ăn'],
  ['atBedtime', 'Trước khi ngủ'],
  ['everyHours', 'Cách mấy tiếng'],
  ['asNeeded', 'Khi cần'],
];

function whenComplete() {
  const t = draft.timing;
  if (!t.kind) return false;
  if (t.kind === 'beforeMeals' || t.kind === 'afterMeals') return t.meals.length > 0;
  return true;
}

function draftSentence() {
  const name = draft.strength?.trim() ? `${draft.name.trim()} ${draft.strength.trim()}` : draft.name.trim();
  if (draft.timing.kind === 'asNeeded') return `Uống ${name} khi cần.`;
  return `Uống ${core.quantityText(draft.halves)} viên ${name} ${core.timingSummary(draft.timing)}.`;
}

function viewAdd() {
  const step = draft.step;
  const progress = [0, 1, 2, 3].map((i) => `<span class="${i <= step ? 'on' : ''}"></span>`).join('');
  const top = `
    <div class="row">
      <button class="btn-icon" data-act="draftBack" aria-label="${step === 0 ? 'Đóng' : 'Quay lại'}">${svg(step === 0 ? 'close' : 'back')}</button>
      <div class="progress">${progress}</div>
      <span class="muted" style="font-weight:600">${step + 1}/4</span>
    </div>`;
  let body = '';
  let footer = '';
  if (step === 0) {
    body = `
      <h1>Chụp hộp thuốc hoặc vỉ thuốc</h1>
      <p style="color:var(--body)">Chụp rõ mặt có tên thuốc. Cinnamon sẽ thử đọc tên, và ảnh giúp bạn nhận ra thuốc khi được nhắc.</p>
      <label class="camera" aria-label="Chụp ảnh thuốc">
        ${draft.photo ? `<img src="${esc(draft.photo)}" alt="Ảnh thuốc">` : `<div class="stack" style="align-items:center">${svg('camera', 40, 2)}<strong>Chụp ảnh</strong></div>`}
        <input type="file" accept="image/*" capture="environment" data-bind="photo">
      </label>
      ${ocrStatus()}
      <label class="field"><span class="eyebrow">Tên thuốc</span><input data-bind="draft.name" class="${draft.ocr?.state === 'failed' && !draft.name ? 'attention' : ''}" value="${esc(draft.name)}" placeholder="Ví dụ: Prednisolon" autocomplete="off" autocapitalize="words"></label>
      <input data-bind="draft.strength" value="${esc(draft.strength || '')}" placeholder="Hàm lượng, ví dụ 5 mg (không bắt buộc)" autocomplete="off">`;
    footer = `<button class="btn-block" data-act="draftNext" data-need="name">Tiếp</button>`;
  } else if (step === 1) {
    const t = draft.timing;
    const meals =
      t.kind === 'beforeMeals' || t.kind === 'afterMeals'
        ? `<section class="card chai">
            <strong style="color:var(--bark);font-size:20px">${t.kind === 'beforeMeals' ? 'Trước bữa nào?' : 'Sau bữa nào?'}</strong>
            <div class="grid3">${core.MEALS.map((m) => `<button class="choice pill-choice" aria-pressed="${t.meals.includes(m)}" data-act="toggleMeal" data-meal="${m}">${core.MEAL_SHORT[m]}</button>`).join('')}</div>
          </section>`
        : '';
    const interval =
      t.kind === 'everyHours'
        ? `<section class="card chai">
            <label class="row between"><strong>Cứ mấy tiếng một lần?</strong>
              <select data-bind="draft.hours" style="width:auto">${[4, 6, 8, 12, 24].map((h) => `<option value="${h}" ${t.hours === h ? 'selected' : ''}>${h} tiếng</option>`).join('')}</select></label>
            <label class="row between"><strong>Liều đầu tiên</strong><input type="time" value="${core.clockText(t.start)}" data-bind="draft.start"></label>
          </section>`
        : '';
    body = `
      <h1>Uống thuốc này khi nào?</h1>
      <div class="grid2">${TIMING_KINDS.map(([k, l]) => `<button class="choice" aria-pressed="${t.kind === k}" data-act="pickTiming" data-kind="${k}">${l}</button>`).join('')}</div>
      ${meals}${interval}`;
    footer = `<button class="btn-block" data-act="draftNext" ${whenComplete() ? '' : 'disabled'}>Tiếp</button>`;
  } else if (step === 2) {
    body = `
      <h1>Mỗi lần uống mấy viên?</h1>
      <section class="hero row between" style="padding:28px 20px">
        <button class="btn-icon" style="width:68px;height:68px;background:rgba(250,243,232,.14);color:var(--cream);font-size:32px" data-act="qty" data-d="-1" aria-label="Bớt nửa viên">−</button>
        <div style="text-align:center"><div class="bignum">${core.quantityText(draft.halves)}</div><div class="sub">viên</div></div>
        <button class="btn-icon" style="width:68px;height:68px;background:var(--caramel);color:var(--ink);font-size:32px" data-act="qty" data-d="1" aria-label="Thêm nửa viên">+</button>
      </section>
      <div class="grid4">${[1, 2, 4, 6].map((h) => `<button class="choice pill-choice" aria-pressed="${draft.halves === h}" data-act="setQty" data-h="${h}">${core.quantityText(h)}</button>`).join('')}</div>`;
    footer = `<button class="btn-block" data-act="draftNext">Tiếp</button>`;
  } else {
    body = `
      <section class="card" style="align-items:center;text-align:center;padding:24px 20px">
        <div style="position:relative">${photoTag(draft, 96)}<span style="position:absolute;right:-10px;bottom:-10px">${icon.star('#E8A15C', 38)}</span></div>
        <h2>Kiểm tra lại nhé</h2>
        <p style="font-size:22px">${esc(draftSentence())}</p>
        <button class="btn-chip" data-act="readAloud">${svg('speaker', 20)} Đọc to cho tôi nghe</button>
      </section>
      <div class="eyebrow">Không bắt buộc</div>
      <label class="card row between" style="padding:14px 16px"><span>Số viên còn lại</span><input type="number" inputmode="numeric" min="0" style="width:90px;text-align:center;background:var(--chai)" value="${esc(draft.remaining)}" data-bind="draft.remaining" placeholder="30"></label>`;
    footer = `
      <button class="btn-jade btn-block" data-act="saveMed">${svg('check', 26, 2.6)} Đúng rồi, lưu lại</button>
      <button class="btn-link" data-act="draftTo" data-step="1">Chưa đúng, sửa lại</button>
      ${draft.isNew ? '' : '<button class="btn-link" style="color:var(--chili)" data-act="deleteMed">Xoá thuốc này</button>'}`;
  }
  return `${top}${body}<div class="spacer"></div>${footer}`;
}

function ocrStatus() {
  const o = draft.ocr;
  if (!o) return '';
  if (o.state === 'reading') {
    return `<div class="card chai row notice" role="status"><span class="spin" style="width:28px;height:28px;flex-shrink:0">${icon.spiral('#A2532A', 2.4)}</span>
      <span class="grow">Đang đọc tên thuốc trên ảnh…${o.firstTime ? '<br><span class="small muted">Lần đầu cần tải bộ đọc chữ, mất khoảng một phút.</span>' : ''}</span></div>`;
  }
  if (o.state === 'found') {
    const others = (o.candidates || []).filter((c) => c !== draft.name);
    return `<div class="card jade notice stack" role="status" style="gap:8px"><span>Cinnamon đọc được tên thuốc. <strong>Xem lại</strong> và sửa nếu chưa đúng.</span>
      ${others.length ? `<span class="small">Hay là:</span><div class="row" style="flex-wrap:wrap;gap:8px">${others.map((c) => `<button class="btn-chip" data-act="pickName" data-name="${esc(c)}">${esc(c)}</button>`).join('')}</div>` : ''}</div>`;
  }
  return `<div class="card honey notice" role="status">${
    o.offline ? 'Cần có mạng trong lần đầu đọc ảnh. ' : 'Cinnamon chưa đọc được tên trên ảnh. '
  }Bạn gõ tên thuốc vào ô bên dưới nhé, hoặc chụp lại gần hơn, đủ sáng.</div>`;
}

// ---------- Reading the label (on this phone) ----------

// Text recognition runs in the browser; the photo never leaves the phone. The first time,
// the reader (about 5 MB) is downloaded from the jsDelivr CDN and then kept by the browser.
const TESSERACT = 'https://cdn.jsdelivr.net/npm/tesseract.js@7.0.0/dist/tesseract.min.js';
let ocrWorker = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.onload = resolve;
    el.onerror = () => reject(new Error('script'));
    document.head.append(el);
  });
}

function labelReader() {
  if (!ocrWorker) {
    ocrWorker = (async () => {
      if (!window.Tesseract) await loadScript(TESSERACT);
      const worker = await window.Tesseract.createWorker('vie');
      localStorage.setItem('cinnamon.ocrReady', '1');
      return worker;
    })();
    ocrWorker.catch(() => (ocrWorker = null));
  }
  return ocrWorker;
}

const withTimeout = (promise, ms) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), ms))]);

async function imageCanvas(file, maxSide) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function readLabel(file) {
  const canvas = await imageCanvas(file, 1600);
  const worker = await labelReader();
  const { data } = await worker.recognize(canvas, {}, { blocks: true });
  const lines = (data.blocks || []).flatMap((b) => (b.paragraphs || []).flatMap((p) => p.lines || []));
  return companion.guessLabel(lines.map((l) => ({ text: l.text.trim(), height: l.bbox.y1 - l.bbox.y0, confidence: l.confidence })));
}

async function recognizeInto(target, file) {
  target.ocr = { state: 'reading', firstTime: !localStorage.getItem('cinnamon.ocrReady') };
  render();
  try {
    const guess = await withTimeout(readLabel(file), 120_000);
    if (guess.name) {
      if (!target.name.trim() || target.nameFromPhoto) {
        target.name = guess.name;
        target.strength = guess.strength || '';
        target.nameFromPhoto = true;
      }
      target.ocr = { state: 'found', candidates: guess.candidates };
    } else {
      target.ocr = { state: 'failed' };
    }
  } catch {
    target.ocr = { state: 'failed', offline: navigator.onLine === false };
  }
  if (draft === target && ['add', 'edit'].includes(route().name)) render();
}

async function readPhoto(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, 320 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.75);
  } finally {
    URL.revokeObjectURL(url);
  }
}

function speak(text) {
  if (!('speechSynthesis' in window)) return toast('Máy này chưa hỗ trợ đọc to.');
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'vi-VN';
  u.rate = 0.85;
  const voice = speechSynthesis.getVoices().find((v) => v.lang?.toLowerCase().startsWith('vi'));
  if (voice) u.voice = voice;
  speechSynthesis.cancel();
  speechSynthesis.speak(u);
}

// ---------- Hỏi Cinnamon (chat) ----------

let chatDraft = '';
let chatBusy = false;
let chatError = null;
let chatIdeas = false;

const CHAT_ERRORS = {
  offline: 'Cần có mạng để hỏi Cinnamon. Bạn kiểm tra wifi hoặc 4G rồi thử lại nhé.',
  limit: 'Hôm nay bạn đã hỏi nhiều rồi. Ngày mai hỏi tiếp nhé.',
  setup: 'Phần trò chuyện chưa được bật. Người cài đặt cần thêm khoá Claude (xem hướng dẫn).',
  busy: 'Cinnamon đang bận một chút. Bạn thử lại sau ít phút nhé.',
  failed: 'Chưa gửi được câu hỏi. Bạn thử lại nhé.',
};

const stripMarks = (text) => text.replace(/\*\*/g, '');
const formatReply = (text) => esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

function chatContextText() {
  return companion.chatContext({
    now: now(),
    profile: state.profile,
    checkIn: todaysCheckIn(),
    outdoor: companion.outdoorSummary(currentOutlook(), currentHour()),
    fluidLimitMl: state.fluidLimitMl,
  });
}

async function sendChat(text) {
  text = String(text || '').trim().slice(0, companion.CHAT_MAX_CHARS);
  if (!text || chatBusy) return;
  state.chat = [...state.chat, { role: 'user', text, at: now() }].slice(-companion.CHAT_HISTORY_KEPT);
  chatDraft = '';
  save();
  await askCinnamon();
}

async function askCinnamon() {
  if (chatBusy) return;
  chatBusy = true;
  chatError = null;
  render();
  try {
    const res = await fetch(`/api/devices/${state.deviceId}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: companion.historyToSend(state.chat), context: chatContextText() }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && data.text) {
      state.chat = [...state.chat, { role: 'assistant', text: data.text, at: now() }].slice(-companion.CHAT_HISTORY_KEPT);
      save();
    } else {
      chatError = { limit: 'limit', 'not configured': 'setup', busy: 'busy' }[data.error] || 'failed';
    }
  } catch {
    chatError = navigator.onLine === false ? 'offline' : 'failed';
  }
  chatBusy = false;
  if (route().name === 'chat') render();
}

function chatBubble(m, i) {
  if (m.role === 'user') return `<div class="bubble mine">${esc(m.text)}</div>`;
  const steps = companion.parseSteps(m.text);
  return `<div class="bubble">
      <div class="reply">${formatReply(m.text)}</div>
      <div class="row" style="flex-wrap:wrap;gap:8px">
        <button class="btn-chip" data-act="speakMsg" data-i="${i}">${svg('speaker', 18)} Đọc to</button>
        ${steps.length ? `<button class="btn-chip" data-act="stepsFromMsg" data-i="${i}">${svg('play', 18)} Làm từng bước</button>` : ''}
      </div>
    </div>`;
}

function viewChat() {
  const empty = !state.chat.length;
  const routines = companion.routinesFor(dayAdjust().energy);
  const intro = `
    <section class="card chai stack">
      <strong style="font-size:20px">Cinnamon giúp bạn nấu ăn, giãn cơ và tập nhẹ.</strong>
      <span style="color:var(--body)">Bấm một gợi ý, hoặc gõ câu hỏi. Có thể bấm micro trên bàn phím để nói.</span>
      <div class="starters">${companion.CHAT_STARTERS.map((c) => `<button class="btn-chip" data-act="ask" data-text="${esc(c.text)}">${esc(c.label)}</button>`).join('')}</div>
    </section>
    ${!state.profile.conditions.length && !state.profile.saltG ? `<a class="small" href="#/settings">Cho Cinnamon biết về sức khoẻ của bạn trong Cài đặt để gợi ý đúng hơn.</a>` : ''}
    <div class="eyebrow">Tập ngay, theo từng bước</div>
    ${routines.map((r) => routineCard(r)).join('')}`;
  const thread = state.chat.map(chatBubble).join('');
  const status = chatBusy
    ? `<div class="bubble row" role="status"><span class="spin" style="width:24px;height:24px">${icon.spiral('#A2532A', 2.4)}</span> Cinnamon đang nghĩ…</div>`
    : chatError
      ? `<div class="card honey notice stack" role="alert">${CHAT_ERRORS[chatError]}${chatError !== 'limit' && chatError !== 'setup' ? '<button class="btn-soft" data-act="retryChat">Thử lại</button>' : ''}</div>`
      : '';
  return `
    ${header('Hỏi Cinnamon')}
    ${empty ? intro : thread}
    ${!empty && chatIdeas ? intro : ''}
    ${status}
    <div id="chat-end"></div>
    <div class="spacer"></div>
    <div class="composer">
      <textarea data-bind="chat.text" rows="2" maxlength="${companion.CHAT_MAX_CHARS}" placeholder="Hỏi Cinnamon…" aria-label="Câu hỏi">${esc(chatDraft)}</textarea>
      <button class="btn-icon send" data-act="sendChat" aria-label="Gửi" ${chatBusy ? 'disabled' : ''}>${svg('send', 24, 2.6)}</button>
    </div>
    ${empty ? '' : `<div class="row between"><a class="small" href="#/chat" data-act="showIdeas">${chatIdeas ? 'Ẩn gợi ý' : 'Gợi ý khác'}</a><button class="btn-link" style="min-height:40px;font-size:15px" data-act="clearChat">Xoá cuộc trò chuyện</button></div>`}
    <p class="small muted" style="margin-top:-8px">Cinnamon dùng Claude để trả lời. Cuộc trò chuyện chỉ lưu trên máy này. Cinnamon không thay bác sĩ; khi cấp cứu, gọi 115.</p>`;
}

// ---------- Step-by-step player (routines and cooking steps) ----------

let player = null;
let playerTimer = null;

function speakStep() {
  if (!player) return;
  const step = player.steps[player.index];
  if (step) speak(`${step.title}. ${step.how}`);
  else if (player.index < 0) speak(`${player.title}. Chỉ ${player.minutes} phút. ${player.why}`);
}

function showStep(index) {
  if (!player) return;
  player.index = index;
  const step = player.steps[index];
  player.pausedLeft = null;
  player.endsAt = step?.seconds ? now() + step.seconds * 1000 : null;
  if (index >= player.steps.length && !player.fromChat && !player.recorded) {
    player.recorded = true;
    state.activities = [...state.activities, { id: player.id, dayKey: todayKey(), at: now(), minutes: player.minutes }].slice(-90);
    save();
  }
  if (player.voice && step) speakStep();
  render();
}

function tickPlayer() {
  const el = document.getElementById('timer');
  if (!player || !player.endsAt) return;
  const left = Math.max(0, Math.ceil((player.endsAt - now()) / 1000));
  if (el) el.textContent = clock(left);
  if (left === 0) {
    player.endsAt = null;
    player.timerDone = player.index;
    if (player.voice) speak('Xong. Bấm Tiếp để sang bước sau.');
    render();
  }
}

const clock = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;

function viewPlayer() {
  const p = player;
  const total = p.steps.length;
  const voice = `<button class="btn-chip" data-act="playerVoice" aria-pressed="${Boolean(p.voice)}">${svg('speaker', 18)} ${p.voice ? 'Đang đọc từng bước' : 'Đọc to từng bước'}</button>`;
  if (p.index < 0) {
    return `
      ${header(p.kind || 'Vận động', 'home')}
      <section class="hero stack" style="gap:12px">
        <div class="eyebrow">Chỉ ${p.minutes} phút · ${total} động tác</div>
        <h1 style="color:var(--cream)">${esc(p.title)}</h1>
        <p style="font-size:20px;color:var(--chai)"><strong style="color:var(--caramel)">Vì sao nên tập:</strong> ${esc(p.why)}</p>
      </section>
      <div class="row" style="flex-wrap:wrap;gap:8px">${voice}<button class="btn-chip" data-act="playerSpeak">${svg('speaker', 18)} Nghe giới thiệu</button></div>
      <div class="card chai small">Cần một chiếc ghế chắc chắn. ${esc(companion.STOP_NOTE)}</div>
      <div class="spacer"></div>
      <button class="btn-jade btn-block" data-act="playerStart">${svg('play', 24)} Bắt đầu</button>`;
  }
  if (p.index >= total) {
    return `
      <div class="spacer"></div>
      <section class="card" style="align-items:center;text-align:center;padding:28px 20px">
        ${icon.star('#2F6B5A', 56)}
        <h2>Xong rồi!</h2>
        <p style="font-size:20px">${p.fromChat ? 'Bạn đã làm xong tất cả các bước.' : `Bạn vừa dành ${p.minutes} phút cho cơ thể. Cơ thể sẽ cảm ơn bạn.`}</p>
      </section>
      <div class="spacer"></div>
      <button class="btn-block" data-act="playerDone">${p.fromChat ? 'Quay lại trò chuyện' : 'Về trang chính'}</button>`;
  }
  const step = p.steps[p.index];
  const progress = p.steps.map((_, i) => `<span class="${i <= p.index ? 'on' : ''}"></span>`).join('');
  let timer = '';
  if (step.seconds) {
    const running = p.endsAt != null;
    const paused = p.pausedLeft != null;
    const left = running ? Math.max(0, Math.ceil((p.endsAt - now()) / 1000)) : paused ? Math.ceil(p.pausedLeft / 1000) : 0;
    timer = p.timerDone === p.index && !running && !paused
      ? `<div class="timer done">${svg('check', 44, 3)}</div>`
      : `<button class="timer" data-act="playerPause" aria-label="${paused ? 'Chạy tiếp' : 'Tạm dừng'}"><span id="timer">${clock(left)}</span><small>${paused ? 'Bấm để chạy tiếp' : 'Bấm để tạm dừng'}</small></button>`;
  }
  return `
    <div class="row">
      <a class="btn btn-icon" href="#/${p.fromChat ? 'chat' : 'home'}" aria-label="Dừng">${svg('close')}</a>
      <div class="progress">${progress}</div>
      <span class="muted" style="font-weight:600">${p.index + 1}/${total}</span>
    </div>
    <section class="card stack" style="gap:14px;padding:24px 20px">
      <div class="eyebrow">${esc(p.title)}</div>
      <h1 style="font-size:32px">${esc(step.title)}</h1>
      <p style="font-size:22px;line-height:1.5">${formatReply(step.how)}</p>
    </section>
    ${timer}
    <div class="row" style="flex-wrap:wrap;gap:8px">${voice}<button class="btn-chip" data-act="playerSpeak">${svg('speaker', 18)} Đọc bước này</button></div>
    <div class="spacer"></div>
    <div class="grid2">
      ${p.index > 0 ? '<button class="btn-soft" data-act="playerPrev">Quay lại</button>' : ''}
      <button data-act="playerNext">${p.index + 1 === total ? 'Xong' : 'Tiếp'}</button>
    </div>`;
}

setInterval(tickPlayer, 500);

// ---------- Settings ----------

function viewSettings() {
  const r = state.rhythm;
  const timeRow = (key, label) => `
    <label class="row between" style="min-height:56px;padding:0 6px"><span style="font-weight:600">${label}</span>
      <input type="time" value="${core.clockText(r[key])}" data-bind="rhythm.${key}"></label>`;
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  let push;
  if (isIOS() && !isStandalone()) {
    push = `<p>Để nhận nhắc thuốc trên iPhone, cần thêm Cinnamon vào Màn hình chính:</p>
      <ol style="margin:0;padding-left:22px;display:flex;flex-direction:column;gap:6px">
        <li>Mở trang này bằng <strong>Safari</strong>.</li>
        <li>Bấm nút <strong>Chia sẻ</strong> (hình vuông có mũi tên lên).</li>
        <li>Chọn <strong>Thêm vào MH chính</strong>, rồi bấm <strong>Thêm</strong>.</li>
        <li>Mở Cinnamon từ biểu tượng mới và quay lại trang này.</li>
      </ol>`;
  } else if (!supported) {
    push = '<p>Trình duyệt này không hỗ trợ thông báo.</p>';
  } else if (state.push.enabled) {
    push = `<p>Đã bật. Cinnamon sẽ nhắc cả khi ứng dụng đang đóng.</p>
      <div class="grid2"><button class="btn-soft" data-act="testPush">Gửi thử</button><button class="btn-soft" data-act="disablePush">Tắt</button></div>`;
  } else {
    push = `<p>Cho phép Cinnamon gửi thông báo nhắc uống thuốc, cả khi ứng dụng đang đóng.</p><button class="btn-block" data-act="enablePush">Bật nhắc thuốc</button>`;
  }
  return `
    ${header('Cài đặt')}
    <section class="card"><div class="eyebrow">Nhắc thuốc</div>${push}</section>
    <section class="card" style="gap:0;padding:8px 12px">
      <div class="eyebrow" style="padding:10px 6px">Một ngày bình thường</div>
      ${timeRow('wake', 'Thức dậy')}${timeRow('breakfast', 'Bữa sáng')}${timeRow('lunch', 'Bữa trưa')}${timeRow('dinner', 'Bữa tối')}${timeRow('bed', 'Đi ngủ')}
    </section>
    <section class="card">
      <div class="eyebrow">Khu vực nhà</div>
      ${locationControls('settings', state.home)}
    </section>
    <section class="card">
      <div class="eyebrow">Xem thử (để kiểm tra)</div>
      <label class="stack"><span>Dùng dữ liệu thời tiết mẫu thay cho dữ liệu thật</span>
        <select data-bind="demo">
          <option value="" ${!state.demo ? 'selected' : ''}>Tắt (dữ liệu thật)</option>
          <option value="smog" ${state.demo === 'smog' ? 'selected' : ''}>Không khí xấu (AQI 165)</option>
          <option value="heat" ${state.demo === 'heat' ? 'selected' : ''}>Nắng nóng (36°C)</option>
        </select></label>
      <p class="small muted">Chỉ dùng để xem thử. Nhớ tắt khi dùng thật.</p>
    </section>
    <section class="card">
      <div class="eyebrow">Sức khoẻ (không bắt buộc)</div>
      <p class="small muted">Để Cinnamon gợi ý món ăn và bài tập hợp với bạn.</p>
      ${companion.PROFILE_OPTIONS.map(([v, l]) => `<label class="toggle"><span>${l}</span><input type="checkbox" value="${v}" data-bind="condition" ${state.profile.conditions.includes(v) ? 'checked' : ''}></label>`).join('')}
      <label class="row between"><span>Muối tối đa mỗi ngày (g)</span>
        <input type="number" inputmode="decimal" min="0" step="0.5" style="width:110px;text-align:center;background:var(--chai)" value="${state.profile.saltG ?? ''}" data-bind="salt" placeholder="—"></label>
      <label class="row between"><span>Đạm tối đa mỗi ngày (g)</span>
        <input type="number" inputmode="decimal" min="0" style="width:110px;text-align:center;background:var(--chai)" value="${state.profile.proteinG ?? ''}" data-bind="protein" placeholder="—"></label>
      <label class="row between"><span>Giới hạn nước mỗi ngày (ml)</span>
        <input type="number" inputmode="numeric" min="0" style="width:110px;text-align:center;background:var(--chai)" value="${state.fluidLimitMl ?? ''}" data-bind="fluid" placeholder="—"></label>
      <p class="small muted">Điền theo lời bác sĩ dặn. Nếu để trống, Cinnamon sẽ không tự đặt con số. Cinnamon không bao giờ khuyên uống nước quá giới hạn này.</p>
    </section>
    <section class="card">
      <div class="eyebrow">Dữ liệu</div>
      <p class="small muted">Thuốc, ảnh, nhật ký và cuộc trò chuyện chỉ lưu trên điện thoại này. Máy chủ nhắc thuốc chỉ biết giờ nhắc, không biết tên thuốc. Khi bạn hỏi Cinnamon, câu hỏi được gửi tới Claude (Anthropic) để trả lời và không được lưu trên máy chủ Cinnamon.</p>
      <button class="btn-link" style="color:var(--chili)" data-act="deleteAll">Xoá toàn bộ dữ liệu</button>
    </section>`;
}

let addressDraft = '';

function homeLabel(home) {
  if (!home || home.approx) return 'Đang dùng trung tâm Hà Nội.';
  return home.label ? `Đang dùng: ${esc(home.label)} (làm tròn khoảng 5 km).` : 'Đang dùng vị trí của bạn (làm tròn khoảng 5 km).';
}

function locationControls(target, home) {
  return `
    <p>${homeLabel(home)}</p>
    <label class="field"><span class="small muted">Nhập địa chỉ, ví dụ: Láng Hạ, Đống Đa, Hà Nội</span>
      <input data-bind="address" value="${esc(addressDraft)}" placeholder="Phường, quận, thành phố" autocomplete="street-address" enterkeyhint="search"></label>
    <div class="grid2">
      <button class="btn-soft" data-act="findAddress" data-target="${target}">Tìm địa chỉ</button>
      <button class="btn-soft" data-act="locate" data-target="${target}">${svg('pin', 20)} Vị trí hiện tại</button>
    </div>
    <p class="small muted">Chỉ để xem không khí và thời tiết. Vị trí được làm tròn khoảng 5 km trước khi gửi đi.${target === 'welcome' ? ' Nếu bỏ qua, Cinnamon dùng trung tâm Hà Nội.' : ''}</p>`;
}

function setHome(target, home) {
  if (target === 'welcome') {
    welcomeDraft.home = home;
    render();
    return;
  }
  state.home = home;
  state.forecast = null;
  commit();
  refreshForecast(true);
}

/** Looks up an address with OpenStreetMap's free search (only when she taps "Tìm"). */
async function findAddress(target) {
  const q = addressDraft.trim();
  if (q.length < 3) return toast('Nhập địa chỉ trước nhé.');
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&accept-language=vi&countrycodes=vn&q=${encodeURIComponent(q)}`;
    const [hit] = await (await fetch(url)).json();
    if (!hit) return toast('Không tìm thấy địa chỉ này. Thử ghi tên phường, quận.');
    const label = hit.display_name.split(',').slice(0, 3).map((x) => x.trim()).join(', ');
    setHome(target, { ...core.coarsen({ lat: Number(hit.lat), lon: Number(hit.lon) }), label });
    toast(`Đã chọn: ${label}`);
  } catch {
    toast('Chưa tìm được. Kiểm tra mạng rồi thử lại.');
  }
}

function locate(target) {
  if (!('geolocation' in navigator)) return toast('Máy này không lấy được vị trí.');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      setHome(target, core.coarsen({ lat: pos.coords.latitude, lon: pos.coords.longitude }));
      toast('Đã lấy vị trí.');
    },
    () => toast('Không lấy được vị trí. Cinnamon sẽ dùng trung tâm Hà Nội.'),
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 3600_000 },
  );
}

// ---------- Push ----------

let syncTimer = null;

function scheduleSync() {
  clearTimeout(syncTimer);
  syncTimer = setTimeout(syncReminders, 600);
}

/** Uploads the next 7 days of reminder times (generic text only) to the reminder server. */
async function syncReminders() {
  if (!state.push.enabled || !state.onboarded) return;
  const start = today();
  const doses = [];
  for (let i = 0; i < 7; i++) doses.push(...dosesOn(core.addDays(start, i)));
  const items = core.notificationItems(doses, state.log, state.settings, now()).slice(0, 400);
  try {
    const res = await fetch(`/api/devices/${state.deviceId}/reminders`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
    });
    if (res.ok) {
      state.push.lastSync = now();
      save();
    }
  } catch {
    /* offline: will retry next time the app opens */
  }
}

function keyBytes(b64) {
  const s = b64.replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(s + '='.repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
}

async function enablePush() {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return toast('Chưa được phép gửi thông báo. Có thể bật lại trong Cài đặt của iPhone.');
    const reg = await navigator.serviceWorker.ready;
    const { vapidPublicKey } = await (await fetch('/api/config')).json();
    let sub = await reg.pushManager.getSubscription();
    if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(vapidPublicKey) });
    const res = await fetch(`/api/devices/${state.deviceId}/subscription`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(sub.toJSON()),
    });
    if (!res.ok) throw new Error('subscribe failed');
    state.push.enabled = true;
    save();
    await syncReminders();
    render();
    await fetch(`/api/devices/${state.deviceId}/test`, { method: 'POST' });
    toast('Đã bật nhắc thuốc. Bạn sẽ nhận một thông báo thử.');
  } catch {
    toast('Chưa bật được. Kiểm tra mạng rồi thử lại.');
  }
}

async function disablePush() {
  try {
    const reg = await navigator.serviceWorker.ready;
    await (await reg.pushManager.getSubscription())?.unsubscribe();
  } catch {
    /* ignore */
  }
  await fetch(`/api/devices/${state.deviceId}`, { method: 'DELETE' }).catch(() => {});
  state.push.enabled = false;
  commit();
}

// ---------- Actions ----------

function recordMeal(meal, field) {
  const key = todayKey();
  const ev = { ...eventsFor(key) };
  ev.mealStart = { ...(ev.mealStart || {}) };
  ev.mealEnd = { ...(ev.mealEnd || {}) };
  if (field === 'end') {
    ev.mealStart[meal] ||= now();
    ev.mealEnd[meal] = now();
  } else {
    ev.mealStart[meal] = now();
  }
  state.events[key] = ev;
}

function applyToDose(id, fn) {
  const dose = findDose(id);
  if (!dose) return;
  fn(dose);
  commit({ rerender: false });
  go('home');
}

const actions = {
  finishWelcome() {
    const r = { ...welcomeDraft.rhythm };
    r.bed = core.normalizeMinutes(r.bed % 1440, r);
    if (r.bed < r.dinner) r.bed += 1440;
    state.rhythm = r;
    state.home = welcomeDraft.home || HANOI;
    state.onboarded = true;
    welcomeDraft = null;
    commit({ rerender: false });
    refreshForecast(true);
    go('home');
    render();
  },
  locate: (d) => locate(d.target),
  findAddress: (d) => findAddress(d.target),
  startMeal(d) {
    recordMeal(d.meal, 'start');
    commit({ rerender: false });
    const dose = todaysDoses().find((x) => x.anchor.kind === 'beforeMeal' && x.anchor.meal === d.meal && !core.isHandled(statusOf(x)));
    if (dose) go(`dose/${encodeURIComponent(dose.id)}`);
    else render();
  },
  finishMeal(d) {
    recordMeal(d.meal, 'end');
    commit({ rerender: false });
    const dose = todaysDoses().find((x) => x.anchor.kind === 'afterMeal' && x.anchor.meal === d.meal && !core.isHandled(statusOf(x)));
    if (dose) go(`dose/${encodeURIComponent(dose.id)}`);
    else render();
  },
  taken: (d) =>
    applyToDose(d.id, (dose) => {
      state.log = core.markTaken(state.log, dose, now());
      for (const item of dose.items) {
        const m = medById(item.medId);
        if (m && m.remainingHalves != null) m.remainingHalves = Math.max(0, m.remainingHalves - item.halves);
      }
      toast('Tốt lắm!');
    }),
  snooze: (d) => applyToDose(d.id, (dose) => (state.log = core.snooze(state.log, dose, now() + Number(d.min) * MIN))),
  skip: (d) => applyToDose(d.id, (dose) => (state.log = core.markSkipped(state.log, dose, now()))),
  pickSleep: (d) => ((checkinDraft.sleep = d.v), render()),
  pickEnergy: (d) => ((checkinDraft.energy = d.v), render()),
  skipCheckin() {
    sessionStorage.setItem('checkinSkipped', todayKey());
    go('home');
  },
  saveCheckin() {
    const key = todayKey();
    state.checkIns = state.checkIns.filter((c) => c.dayKey !== key).concat({ dayKey: key, at: now(), sleep: checkinDraft.sleep, energy: checkinDraft.energy });
    state.checkIns = state.checkIns.slice(-60);
    const ev = { ...eventsFor(key) };
    ev.wokeAt ||= now();
    state.events[key] = ev;
    checkinDraft = { sleep: null, energy: null };
    commit({ rerender: false });
    go('home');
  },
  draftBack() {
    if (draft.step === 0) {
      draft = null;
      history.length > 1 ? history.back() : go('home');
    } else {
      draft.step -= draft.step === 3 && draft.timing.kind === 'asNeeded' ? 2 : 1;
      render();
    }
  },
  draftNext() {
    if (draft.step === 0 && !draft.name.trim()) return toast('Nhập tên thuốc trước nhé.');
    draft.step += draft.step === 1 && draft.timing.kind === 'asNeeded' ? 2 : 1;
    render();
  },
  draftTo: (d) => ((draft.step = Number(d.step)), render()),
  pickTiming(d) {
    draft.timing.kind = d.kind;
    render();
  },
  toggleMeal(d) {
    const meals = draft.timing.meals;
    draft.timing.meals = meals.includes(d.meal) ? meals.filter((m) => m !== d.meal) : [...meals, d.meal];
    render();
  },
  qty: (d) => ((draft.halves = Math.max(1, draft.halves + Number(d.d))), render()),
  setQty: (d) => ((draft.halves = Number(d.h)), render()),
  readAloud: () => speak(draftSentence()),
  saveMed() {
    const t = draft.timing;
    const timing = { kind: t.kind || 'asNeeded' };
    if (t.kind === 'beforeMeals' || t.kind === 'afterMeals') timing.meals = core.MEALS.filter((m) => t.meals.includes(m));
    if (t.kind === 'everyHours') Object.assign(timing, { hours: Number(t.hours), start: t.start });
    const remaining = parseInt(draft.remaining, 10);
    const med = {
      id: draft.id,
      name: draft.name.trim(),
      strength: draft.strength?.trim() || null,
      photo: draft.photo || null,
      halves: draft.halves,
      timing,
      notifyBackup: false,
      remainingHalves: Number.isFinite(remaining) ? remaining * 2 : null,
      active: true,
    };
    const i = state.meds.findIndex((m) => m.id === med.id);
    if (i >= 0) state.meds[i] = med;
    else state.meds.push(med);
    draft = null;
    commit({ rerender: false });
    toast('Đã lưu thuốc.');
    go('home');
  },
  deleteMed() {
    if (!confirm('Xoá thuốc này?')) return;
    state.meds = state.meds.filter((m) => m.id !== draft.id);
    draft = null;
    commit({ rerender: false });
    go('meds');
  },
  pickName(d) {
    draft.name = d.name;
    draft.nameFromPhoto = true;
    render();
  },
  showIdeas() {
    chatIdeas = !chatIdeas;
    render();
    if (chatIdeas) document.getElementById('chat-end')?.previousElementSibling?.scrollIntoView?.({ block: 'start' });
  },
  ask(d) {
    chatIdeas = false;
    go('chat');
    sendChat(d.text);
  },
  sendChat: () => sendChat(chatDraft),
  retryChat: () => askCinnamon(),
  clearChat() {
    if (!confirm('Xoá cuộc trò chuyện trên máy này?')) return;
    state.chat = [];
    chatError = null;
    save();
    render();
  },
  speakMsg: (d) => speak(stripMarks(state.chat[Number(d.i)]?.text || '')),
  stepsFromMsg(d) {
    const steps = companion.parseSteps(state.chat[Number(d.i)]?.text || '');
    if (!steps.length) return;
    player = { id: 'chat', title: 'Làm từng bước', steps, index: 0, fromChat: true };
    showStep(0);
    go('steps');
  },
  playerStart: () => showStep(0),
  playerNext: () => showStep(player.index + 1),
  playerPrev: () => showStep(Math.max(0, player.index - 1)),
  playerSpeak: () => speakStep(),
  playerVoice() {
    player.voice = !player.voice;
    if (player.voice) speakStep();
    else speechSynthesis?.cancel();
    render();
  },
  playerPause() {
    if (player.pausedLeft != null) {
      player.endsAt = now() + player.pausedLeft;
      player.pausedLeft = null;
    } else if (player.endsAt) {
      player.pausedLeft = Math.max(0, player.endsAt - now());
      player.endsAt = null;
    }
    render();
  },
  playerDone() {
    const back = player.fromChat ? 'chat' : 'home';
    player = null;
    go(back);
  },
  enablePush,
  disablePush,
  async testPush() {
    const res = await fetch(`/api/devices/${state.deviceId}/test`, { method: 'POST' }).catch(() => null);
    toast(res?.ok ? 'Đã gửi thông báo thử.' : 'Chưa gửi được. Thử bật lại nhắc thuốc.');
  },
  async deleteAll() {
    if (!confirm('Xoá toàn bộ thuốc, nhật ký và cài đặt trên máy này?')) return;
    await fetch(`/api/devices/${state.deviceId}`, { method: 'DELETE' }).catch(() => {});
    localStorage.removeItem(KEY);
    state = freshState();
    save();
    go('home');
    render();
  },
};

const binds = {
  'welcome.wake': (el) => (welcomeDraft.rhythm.wake = toMinutes(el.value)),
  'welcome.breakfast': (el) => (welcomeDraft.rhythm.breakfast = toMinutes(el.value)),
  'welcome.lunch': (el) => (welcomeDraft.rhythm.lunch = toMinutes(el.value)),
  'welcome.dinner': (el) => (welcomeDraft.rhythm.dinner = toMinutes(el.value)),
  'welcome.bed': (el) => (welcomeDraft.rhythm.bed = toMinutes(el.value)),
  address: (el) => (addressDraft = el.value),
  demo(el) {
    state.demo = el.value || null;
    commit();
  },
  'draft.name': (el) => ((draft.name = el.value), (draft.nameFromPhoto = false)),
  'chat.text': (el) => (chatDraft = el.value),
  salt(el) {
    const v = parseFloat(el.value);
    state.profile = { ...state.profile, saltG: Number.isFinite(v) && v > 0 ? v : null };
    commit({ rerender: false });
  },
  protein(el) {
    const v = parseFloat(el.value);
    state.profile = { ...state.profile, proteinG: Number.isFinite(v) && v > 0 ? v : null };
    commit({ rerender: false });
  },
  condition(el) {
    const set = new Set(state.profile.conditions);
    if (el.checked) set.add(el.value);
    else set.delete(el.value);
    state.profile = { ...state.profile, conditions: [...set] };
    commit({ rerender: false });
  },
  'draft.strength': (el) => (draft.strength = el.value),
  'draft.remaining': (el) => (draft.remaining = el.value),
  'draft.hours': (el) => (draft.timing.hours = Number(el.value)),
  'draft.start': (el) => (draft.timing.start = toMinutes(el.value)),
  fluid(el) {
    const v = parseInt(el.value, 10);
    state.fluidLimitMl = Number.isFinite(v) && v > 0 ? v : null;
    commit({ rerender: false });
  },
  async photo(el) {
    const file = el.files?.[0];
    if (!file) return;
    try {
      draft.photo = await readPhoto(file);
    } catch {
      return toast('Không mở được ảnh này. Bạn thử chụp lại nhé.');
    }
    el.value = '';
    recognizeInto(draft, file);
  },
};

for (const key of ['wake', 'breakfast', 'lunch', 'dinner', 'bed']) {
  binds[`rhythm.${key}`] = (el) => {
    if (!el.value) return;
    let m = toMinutes(el.value);
    if (key === 'bed') {
      m = core.normalizeMinutes(m, state.rhythm);
      if (m < state.rhythm.dinner) m += 1440;
    }
    state.rhythm = { ...state.rhythm, [key]: m };
    commit({ rerender: false });
  };
}

app.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = actions[el.dataset.act];
  if (fn) {
    e.preventDefault();
    fn(el.dataset, el);
  }
});

// Text fields update drafts as she types; time pickers, selects and files apply on change.
app.addEventListener('input', (e) => {
  const b = e.target.dataset?.bind;
  if (b && (b.startsWith('draft.') || b.startsWith('welcome.') || b === 'address' || b === 'chat.text') && e.target.type !== 'file') binds[b]?.(e.target);
});
app.addEventListener('change', (e) => {
  const b = e.target.dataset?.bind;
  if (b) binds[b]?.(e.target);
});

// ---------- Router ----------

function route() {
  const [name, ...rest] = location.hash.replace(/^#\/?/, '').split('/');
  return { name: name || 'home', arg: decodeURIComponent(rest.join('/')) };
}

function render() {
  const { name, arg } = route();
  let html;
  if (!state.onboarded) {
    html = viewWelcome();
  } else if (name === 'dose') {
    html = viewDose(arg);
  } else if (name === 'checkin') {
    html = viewCheckin();
  } else if (name === 'outdoor') {
    html = viewOutdoor();
  } else if (name === 'meds') {
    html = viewMeds();
  } else if (name === 'add' || name === 'edit') {
    if (!draft || (name === 'edit' && draft.id !== arg) || (name === 'add' && !draft.isNew)) {
      const existing = name === 'edit' ? medById(arg) : null;
      if (name === 'edit' && !existing) return go('meds');
      startDraft(existing);
    }
    html = viewAdd();
  } else if (name === 'settings') {
    html = viewSettings();
  } else if (name === 'chat') {
    html = viewChat();
  } else if (name === 'routine' || name === 'steps') {
    if (name === 'routine' && player?.id !== arg) {
      const r = companion.routineById(arg);
      if (!r) return go('home');
      player = { ...r, index: -1 };
    }
    if (!player) return go('chat');
    html = viewPlayer();
  } else {
    if (!todaysCheckIn() && sessionStorage.getItem('checkinSkipped') !== todayKey() && state.meds.length) {
      return go('checkin');
    }
    html = viewHome();
  }
  // Keep the cursor where she was typing when the screen refreshes around it.
  const active = document.activeElement;
  const focusBind = app.contains(active) ? active.dataset?.bind : null;
  const caret = focusBind && typeof active.selectionStart === 'number' ? active.selectionStart : null;
  app.innerHTML = html;
  document.title = 'Cinnamon';
  if (focusBind) {
    const el = app.querySelector(`[data-bind="${focusBind}"]`);
    if (el) {
      el.focus({ preventScroll: true });
      if (caret != null) el.setSelectionRange?.(caret, caret);
    }
  }
  if (name === 'chat') document.getElementById('chat-end')?.scrollIntoView({ block: 'end' });
}

window.addEventListener('hashchange', () => {
  const name = route().name;
  if (!['add', 'edit'].includes(name)) draft = null;
  if (!['routine', 'steps'].includes(name) && player) {
    player = null;
    if ('speechSynthesis' in window) speechSynthesis.cancel();
  }
  render();
  window.scrollTo(0, 0);
});

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    render();
    refreshForecast();
    scheduleSync();
  }
});

setInterval(() => {
  if (document.visibilityState === 'visible' && ['home', 'dose', 'outdoor'].includes(route().name)) render();
}, 60_000);

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

render();
if (state.onboarded) {
  refreshForecast();
  scheduleSync();
}
