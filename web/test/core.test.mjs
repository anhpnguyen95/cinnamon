// Run with: TZ=Asia/Ho_Chi_Minh node --test web/test
import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as core from '../public/core.js';

const at = (h, m = 0, day = 25) => new Date(2026, 8, day, h, m).getTime();
const day = at(0);
// Que's late rhythm: up 10:30, breakfast 11:30, lunch 15:00, dinner 21:30, bed 01:00.
const rhythm = { wake: 630, breakfast: 690, lunch: 900, dinner: 1290, bed: 1500 };
const S = core.DEFAULT_SETTINGS;
const med = (name, timing, extra = {}) => ({ id: name, name, halves: 2, timing, notifyBackup: true, active: true, ...extra });

test('before- and after-meal pills are never grouped', () => {
  const plan = core.plan(day, [med('A', { kind: 'beforeMeals', meals: ['lunch'] }), med('B', { kind: 'afterMeals', meals: ['lunch'] })], {}, rhythm, S);
  assert.equal(plan.length, 2);
  assert.deepEqual(plan.map((d) => core.anchorKey(d.anchor)).sort(), ['after-lunch', 'before-lunch']);
});

test('same-moment pills are grouped', () => {
  const plan = core.plan(day, [med('A', { kind: 'afterMeals', meals: ['lunch'] }), med('B', { kind: 'afterMeals', meals: ['lunch', 'dinner'] }, { halves: 4 })], {}, rhythm, S);
  const lunch = plan.find((d) => d.anchor.kind === 'afterMeal' && d.anchor.meal === 'lunch');
  assert.equal(lunch.items.length, 2);
  assert.equal(plan.length, 2);
});

test('usual times when nothing happened yet', () => {
  const plan = core.plan(day, [med('A', { kind: 'beforeMeals', meals: ['breakfast'] }), med('B', { kind: 'afterMeals', meals: ['dinner'] }), med('C', { kind: 'atBedtime' })], {}, rhythm, S);
  assert.deepEqual(plan.map((d) => d.dueAt), [at(11), at(21, 45), at(1, 0, 26)]);
});

test('"I am eating now" fires before-meal pills; finishing fires after-meal pills', () => {
  const events = { mealStart: { lunch: at(16, 10) } };
  const before = core.plan(day, [med('A', { kind: 'beforeMeals', meals: ['lunch'] })], events, rhythm, S)[0];
  assert.equal(before.dueAt, at(16, 10));
  const after = core.plan(day, [med('B', { kind: 'afterMeals', meals: ['lunch'] })], events, rhythm, S)[0];
  assert.equal(after.dueAt, at(16, 45));
  events.mealEnd = { lunch: at(16, 25) };
  assert.equal(core.plan(day, [med('B', { kind: 'afterMeals', meals: ['lunch'] })], events, rhythm, S)[0].dueAt, at(16, 25));
});

test('interval, as-needed and inactive medicines', () => {
  const plan = core.plan(day, [med('A', { kind: 'everyHours', hours: 12, start: 540 }), med('B', { kind: 'asNeeded' }), med('C', { kind: 'onWaking' }, { active: false })], {}, rhythm, S);
  assert.deepEqual(plan.map((d) => d.dueAt), [at(9), at(21)]);
});

test('late-sleeper day boundaries and likely meal', () => {
  assert.equal(core.activeDay(at(1, 0, 26), rhythm), day);
  assert.equal(core.likelyMeal(22 * 60, rhythm), 'dinner');
  assert.equal(core.likelyMeal(30, rhythm), 'dinner');
  assert.equal(core.likelyMeal(12 * 60, rhythm), 'breakfast');
});

test('status: upcoming → due → missed, snooze pushes the missed point back', () => {
  const dose = core.plan(day, [med('A', { kind: 'afterMeals', meals: ['lunch'] })], {}, rhythm, S)[0]; // due 15:15
  let log = core.emptyLog();
  assert.equal(core.status(log, dose, at(14)).kind, 'upcoming');
  assert.equal(core.status(log, dose, at(15, 30)).kind, 'due');
  assert.equal(core.status(log, dose, at(17)).kind, 'missed');
  log = core.snooze(log, dose, at(15, 45));
  assert.equal(core.status(log, dose, at(15, 30)).kind, 'snoozed');
  assert.equal(core.status(log, dose, at(17)).kind, 'due');
  assert.equal(core.status(log, dose, at(17, 20)).kind, 'missed');
  log = core.markTaken(log, dose, at(17, 25));
  assert.deepEqual(core.status(log, dose, at(20)), { kind: 'taken', at: at(17, 25) });
});

test('notification items: nudge, repeats, missed alert, and no medicine names', () => {
  const dose = core.plan(day, [med('Prednisolon', { kind: 'afterMeals', meals: ['lunch'] })], {}, rhythm, S)[0];
  const items = core.notificationItems([dose], core.emptyLog(), S, at(12));
  assert.deepEqual(items.map((i) => i.at), [at(15, 15), at(15, 30), at(16), at(16, 45)]);
  assert.ok(items.every((i) => !`${i.title} ${i.body}`.includes('Prednisolon')));
  assert.equal(items[0].body, 'Sau bữa trưa · 1 viên');
  const taken = core.markTaken(core.emptyLog(), dose, at(15, 20));
  assert.equal(core.notificationItems([dose], taken, S, at(15, 21)).length, 0);
  // Only future moments are sent.
  assert.deepEqual(core.notificationItems([dose], core.emptyLog(), S, at(15, 40)).map((i) => i.at), [at(16), at(16, 45)]);
});

test('heat index matches the NOAA table', () => {
  assert.ok(Math.abs(core.heatIndexC(32.2, 70) - 41) < 1);
  assert.ok(Math.abs(core.heatIndexC(24, 50) - 24) < 1.5);
});

test('best window after the heat; stay in on bad-air days', () => {
  const hours = [];
  for (let h = 11; h <= 19; h++) {
    const hot = h < 17;
    hours.push({ time: at(h), aqi: h === 19 ? 70 : 40, uv: hot ? 8 : 1, tempC: hot ? 36 : 28, rh: 65 });
  }
  const o = core.outlook(hours, at(11), at(20));
  assert.deepEqual(o.bestWindow, { start: at(17), end: at(19) });
  assert.equal(o.bestRisk, core.RISK.good);
  assert.equal(o.heatDanger.start, at(11));
  assert.equal(o.stayIn, false);

  const smog = [];
  for (let h = 10; h <= 20; h++) smog.push({ time: at(h), aqi: 168, uv: 2, tempC: 27, rh: 60 });
  const bad = core.outlook(smog, at(10), at(21));
  assert.equal(bad.stayIn, true);
  assert.equal(bad.severeAir, true);
  assert.deepEqual([...bad.worstFactors], ['air']);
});

test('walking limit, coarse location, Open-Meteo parsing', () => {
  assert.equal(core.walkingLimit(core.RISK.good, null), 15);
  assert.equal(core.walkingLimit(core.RISK.good, 'low'), 7);
  assert.equal(core.walkingLimit(core.RISK.caution, 'good'), 5);
  assert.equal(core.walkingLimit(core.RISK.good, 'veryLow'), 0);
  assert.deepEqual(core.coarsen({ lat: 21.02851, lon: 105.80417 }), { lat: 21.05, lon: 105.8 });
  const t = at(17) / 1000;
  const hours = core.parseOpenMeteo(
    { hourly: { time: [t, t + 3600], us_aqi: [62, null], uv_index: [1.5, 0.2] } },
    { hourly: { time: [t, t + 3600], temperature_2m: [31.2, 29.8], relative_humidity_2m: [70, 74] } },
  );
  assert.equal(hours.length, 2);
  assert.equal(hours[0].aqi, 62);
  assert.equal(hours[1].aqi, null);
  assert.equal(hours[1].tempC, 29.8);
});

test('check-in adjustments and doctor suggestion', () => {
  assert.equal(core.adjustments({ sleep: 'poor', energy: 'low' }).maxSuggestions, 2);
  assert.equal(core.adjustments({ sleep: 'okay', energy: 'veryLow' }).indoorOnly, true);
  assert.deepEqual(core.adjustments(null), core.NORMAL_DAY);
  const hard = [19, 20, 21, 22, 23].map((d) => ({ dayKey: `2026-09-${d}`, at: at(11, 0, d), sleep: 'poor', energy: 'low' }));
  assert.equal(core.shouldSuggestDoctor(hard, at(12)), true);
  assert.equal(core.shouldSuggestDoctor(hard.slice(0, 4), at(12)), false);
});

test('quantity text and supply', () => {
  assert.equal(core.quantityText(1), '½');
  assert.equal(core.quantityText(3), '1½');
  assert.equal(core.quantityText(4), '2');
  assert.equal(core.daysOfSupplyLeft(med('A', { kind: 'afterMeals', meals: ['breakfast', 'dinner'] }, { remainingHalves: 20 })), 5);
});
