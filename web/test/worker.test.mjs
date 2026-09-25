// Exercises the Worker against a real local D1 database (via wrangler's platform proxy),
// with a fake push service standing in for Apple's.
import assert from 'node:assert/strict';
import { readFileSync, rmSync } from 'node:fs';
import { after, before, test } from 'node:test';
import { createECDH, randomBytes } from 'node:crypto';
import ece from 'http_ece';
import { getPlatformProxy } from 'wrangler';
import worker, { sendDue } from '../worker/index.js';
import { b64url } from '../worker/webpush.js';
import { cleanMessages, handleChat, SYSTEM_PROMPT } from '../worker/chat.js';

const PERSIST = '.wrangler/test-state';
let proxy;
let env;

before(async () => {
  rmSync(PERSIST, { recursive: true, force: true });
  proxy = await getPlatformProxy({ persist: { path: PERSIST } });
  env = { ...proxy.env, ASSETS: { fetch: () => new Response('asset') } };
  for (const statement of readFileSync(new URL('../schema.sql', import.meta.url), 'utf8').split(';').map((s) => s.trim()).filter(Boolean)) {
    await env.DB.prepare(statement).run();
  }
});

after(async () => {
  await proxy?.dispose();
  rmSync(PERSIST, { recursive: true, force: true });
});

const call = (method, path, body) =>
  worker.fetch(new Request(`https://cinnamon.test${path}`, { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) }), env);

test('subscribe, queue reminders, and send only the due ones, encrypted', async () => {
  const device = crypto.randomUUID();
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const auth = randomBytes(16);
  const subscription = { endpoint: 'https://web.push.apple.com/QTest', keys: { p256dh: b64url(ua.getPublicKey()), auth: b64url(auth) } };

  const config = await (await call('GET', '/api/config')).json();
  assert.ok(config.vapidPublicKey.length > 80);
  assert.equal((await call('PUT', `/api/devices/${device}/subscription`, subscription)).status, 200);

  const now = Date.now();
  const items = [
    { id: 'd1#due@1', at: now - 60_000, title: 'Đến giờ uống thuốc', body: 'Sau bữa trưa · 3 viên', url: './#/dose/d1' },
    { id: 'd1#re15@2', at: now + 15 * 60_000, title: 'Nhắc lại', body: 'x', url: './' },
    { id: 'old#due@0', at: now - 2 * 3600_000, title: 'Quá cũ', body: 'x', url: './' },
  ];
  assert.equal((await call('PUT', `/api/devices/${device}/reminders`, { items })).status, 200);

  const sent = [];
  const fakePush = async (url, init) => {
    sent.push({ url, init });
    return new Response(null, { status: 201 });
  };
  assert.equal(await sendDue(env, now, fakePush), 1);
  assert.equal(sent.length, 1);
  const payload = JSON.parse(ece.decrypt(Buffer.from(sent[0].init.body), { version: 'aes128gcm', privateKey: ua, authSecret: auth }).toString());
  assert.deepEqual(payload, { title: 'Đến giờ uống thuốc', body: 'Sau bữa trưa · 3 viên', url: './#/dose/d1', tag: 'd1' });

  // Already sent: not sent again, even if the phone re-uploads the same schedule.
  assert.equal((await call('PUT', `/api/devices/${device}/reminders`, { items })).status, 200);
  assert.equal(await sendDue(env, now + 30_000, fakePush), 0);

  // The repeat goes out when its time comes.
  assert.equal(await sendDue(env, now + 16 * 60_000, fakePush), 1);
});

test('an expired subscription is dropped', async () => {
  const device = crypto.randomUUID();
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  await call('PUT', `/api/devices/${device}/subscription`, { endpoint: 'https://web.push.apple.com/QGone', keys: { p256dh: b64url(ua.getPublicKey()), auth: b64url(randomBytes(16)) } });
  const now = Date.now();
  await call('PUT', `/api/devices/${device}/reminders`, { items: [{ id: 'x#due@1', at: now - 1000, title: 't', body: 'b' }] });
  await sendDue(env, now, async () => new Response(null, { status: 410 }));
  const row = await env.DB.prepare('SELECT subscription FROM devices WHERE id = ?').bind(device).first();
  assert.equal(row.subscription, null);
});

test('rejects bad input and unknown devices', async () => {
  assert.equal((await call('PUT', '/api/devices/not-a-uuid/reminders', { items: [] })).status, 404);
  assert.equal((await call('PUT', `/api/devices/${crypto.randomUUID()}/subscription`, { endpoint: 'http://insecure' })).status, 400);
  assert.equal((await call('POST', `/api/devices/${crypto.randomUUID()}/test`)).status, 409);
  const device = crypto.randomUUID();
  assert.equal((await call('DELETE', `/api/devices/${device}`)).status, 200);
});

// ---------- Chat ----------

const chatRequest = (body) => new Request('https://cinnamon.test/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

function fakeClaude(reply, calls, { status = 200, stop = 'end_turn' } = {}) {
  return async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body), headers: new Headers(init.headers) });
    if (status !== 200) return new Response(JSON.stringify({ type: 'error', error: { type: 'overloaded_error', message: 'busy' } }), { status, headers: { 'content-type': 'application/json' } });
    return new Response(
      JSON.stringify({ id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-haiku-4-5', content: [{ type: 'text', text: reply }], stop_reason: stop, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 5 } }),
      { status: 200, headers: { 'content-type': 'application/json' } },
    );
  };
}

test('chat relays her question to Claude with the day context, and returns the reply', async () => {
  const device = crypto.randomUUID();
  const calls = [];
  const chatEnv = { ...env, ANTHROPIC_API_KEY: 'sk-test', CHAT_MODEL: 'claude-haiku-4-5' };
  const res = await handleChat(
    chatRequest({ messages: [{ role: 'assistant', text: 'orphan' }, { role: 'user', text: 'Hướng dẫn tôi giãn cơ 5 phút' }], context: 'Giờ hiện tại chỗ bạn: 07:30.' }),
    chatEnv,
    device,
    { fetchImpl: fakeClaude('Chỉ 5 phút giúp khớp bớt cứng.\n1. Xoay vai', calls) },
  );
  assert.equal(res.status, 200);
  assert.equal((await res.json()).text, 'Chỉ 5 phút giúp khớp bớt cứng.\n1. Xoay vai');
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/v1\/messages$/);
  assert.equal(calls[0].headers.get('x-api-key'), 'sk-test');
  const sent = calls[0].body;
  assert.equal(sent.model, 'claude-haiku-4-5');
  assert.deepEqual(sent.messages, [{ role: 'user', content: 'Hướng dẫn tôi giãn cơ 5 phút' }]);
  assert.equal(sent.system[0].text, SYSTEM_PROMPT);
  assert.match(sent.system[1].text, /07:30/);
  // Only a count is kept, never the text.
  const row = await env.DB.prepare('SELECT * FROM chat_usage WHERE device_id = ?').bind(device).first();
  assert.equal(row.count, 1);
  assert.deepEqual(Object.keys(row).sort(), ['count', 'day', 'device_id']);
});

test('chat stops at the daily limit, and explains when it is not set up or busy', async () => {
  const device = crypto.randomUUID();
  const calls = [];
  const body = { messages: [{ role: 'user', text: 'Hôm nay nấu gì?' }] };
  const limited = { ...env, ANTHROPIC_API_KEY: 'sk-test', CHAT_LIMIT_DEVICE: '2' };
  for (let i = 0; i < 2; i++) assert.equal((await handleChat(chatRequest(body), limited, device, { fetchImpl: fakeClaude('Canh bí', calls) })).status, 200);
  const over = await handleChat(chatRequest(body), limited, device, { fetchImpl: fakeClaude('Canh bí', calls) });
  assert.equal(over.status, 429);
  assert.equal(calls.length, 2);

  const off = await handleChat(chatRequest(body), { ...env }, device);
  assert.equal(off.status, 503);
  assert.equal((await off.json()).error, 'not configured');

  const busy = await handleChat(chatRequest(body), { ...env, ANTHROPIC_API_KEY: 'sk-test' }, crypto.randomUUID(), { fetchImpl: fakeClaude('', [], { status: 529 }) });
  assert.equal(busy.status, 503);
  assert.equal((await busy.json()).error, 'busy');
});

test('chat rejects malformed conversations', () => {
  assert.equal(cleanMessages([]), null);
  assert.equal(cleanMessages([{ role: 'system', text: 'x' }]), null);
  assert.equal(cleanMessages([{ role: 'user', text: 'a' }, { role: 'assistant', text: 'b' }]), null);
  assert.equal(cleanMessages([{ role: 'user', text: 'x'.repeat(2000) }]), null);
  assert.deepEqual(cleanMessages([{ role: 'user', text: 'a' }, { role: 'user', text: 'b' }]), [{ role: 'user', content: 'a\n\nb' }]);
});

test('the chat route is wired to the worker', async () => {
  const res = await call('POST', `/api/devices/${crypto.randomUUID()}/chat`, { messages: [{ role: 'user', text: 'Chào' }] });
  assert.equal(res.status, 503);
});
