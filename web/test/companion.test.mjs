import assert from 'node:assert/strict';
import { test } from 'node:test';
import * as c from '../public/companion.js';

test('reads the name and strength from a medicine box', () => {
  const guess = c.guessLabel([
    { text: 'Rx Thuốc kê đơn', height: 20, confidence: 90 },
    { text: 'PREDNISOLON 5mg', height: 64, confidence: 88 },
    { text: 'Viên nén', height: 30, confidence: 92 },
    { text: 'Hộp 10 vỉ x 10 viên', height: 18, confidence: 85 },
    { text: 'SĐK: VD-12345-10', height: 14, confidence: 80 },
  ]);
  assert.equal(guess.name, 'Prednisolon');
  assert.equal(guess.strength, '5 mg');
  assert.deepEqual(guess.candidates, ['Prednisolon']);
});

test('keeps mixed-case names, reads comma decimals, ignores unsure text', () => {
  const guess = c.guessLabel([
    { text: 'Plaquenil', height: 50, confidence: 91 },
    { text: 'Hydroxychloroquine sulfate 200 mg', height: 22, confidence: 90 },
    { text: 'ZZkqwx', height: 90, confidence: 20 },
  ]);
  assert.equal(guess.name, 'Plaquenil');
  assert.equal(guess.strength, '200 mg');
  assert.deepEqual(guess.candidates, ['Plaquenil', 'Hydroxychloroquine sulfate']);
  assert.equal(c.strengthIn('Calci 1,25 g'), '1.25 g');
});

test('nothing readable means no guess, so she types it', () => {
  assert.deepEqual(c.guessLabel([]), { name: null, strength: null, candidates: [] });
  assert.equal(c.guessLabel([{ text: '12/2027', height: 40, confidence: 90 }, { text: '|| ~~ ::', height: 60, confidence: 70 }]).name, null);
});

test('every routine says why it helps and stays short', () => {
  for (const r of c.ROUTINES) {
    assert.ok(r.why.length > 20, r.id);
    assert.ok(r.minutes <= 10, r.id);
    const seconds = r.steps.reduce((n, s) => n + s.seconds, 0);
    assert.ok(Math.abs(seconds / 60 - r.minutes) <= 1, `${r.id}: ${seconds}s vs ${r.minutes} min`);
  }
  assert.deepEqual(c.routinesFor('veryLow').map((r) => r.id), ['breathe']);
  assert.ok(!c.routinesFor('low').some((r) => r.id === 'move'));
  assert.equal(c.routinesFor(undefined).length, 3);
});

test('numbered steps in a reply become a step-by-step guide', () => {
  const reply = `Canh bí xanh nấu tôm, khoảng 20 phút.\n\n**Nguyên liệu:** 200 g bí, 50 g tôm.\n\n1. Gọt bí, cắt miếng vừa ăn.\n2. **Phi thơm** hành với ít dầu.\n3) Cho tôm vào đảo khoảng 2 phút.\nBước 4: Thêm 400 ml nước, đun sôi rồi cho bí vào, nấu 5 phút.\n\nChúc bạn ngon miệng!`;
  const steps = c.parseSteps(reply);
  assert.equal(steps.length, 4);
  assert.equal(steps[1].how, 'Phi thơm hành với ít dầu.');
  assert.equal(steps[0].seconds, null);
  assert.equal(steps[2].seconds, 120);
  assert.equal(steps[3].seconds, 300);
  assert.deepEqual(c.parseSteps('1. Một\n2. Hai'), []);
});

test('chat context carries her limits and today, but no medicine names or place', () => {
  const now = new Date(2026, 8, 25, 18, 5).getTime();
  const text = c.chatContext({
    now,
    profile: { conditions: ['kidney', 'lupus', 'noAlcohol'], saltG: 5, proteinG: null },
    checkIn: { sleep: 'poor', energy: 'low' },
    outdoor: 'AQI 165, 34°C',
    fluidLimitMl: 1500,
  });
  assert.match(text, /18:05/);
  assert.match(text, /Muối tối đa bác sĩ dặn: 5 g/);
  assert.match(text, /lupus/);
  assert.match(text, /1500 ml/);
  assert.match(text, /ngủ không ngon và thấy hơi mệt/);
  assert.match(text, /không uống rượu bia/);
  assert.doesNotMatch(text, /Chưa biết giới hạn/);
  const unknown = c.chatContext({ now, profile: { conditions: ['kidney'] } });
  assert.match(unknown, /đừng tự đặt con số/);
  assert.doesNotMatch(unknown, /rượu/);
});

test('outdoor summary for the chat', () => {
  const o = { hours: [{}], stayIn: true, worstRisk: 2 };
  assert.equal(c.outdoorSummary(o, { aqi: 165.2, tempC: 33, heat: 38, uv: 9 }), 'AQI 165, 33°C, cảm giác như 38°C, UV 9, nên ở trong nhà cả ngày');
  assert.equal(c.outdoorSummary(null, null), null);
});

test('history sent to the server starts with her and is capped', () => {
  const history = [{ role: 'assistant', text: 'Chào bạn' }];
  for (let i = 0; i < 20; i++) history.push({ role: i % 2 ? 'assistant' : 'user', text: `m${i}` });
  const sent = c.historyToSend(history);
  assert.ok(sent.length <= c.CHAT_HISTORY_SENT);
  assert.equal(sent[0].role, 'user');
  assert.equal(sent.at(-1).text, 'm19');
});
