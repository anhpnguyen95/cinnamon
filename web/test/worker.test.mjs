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
