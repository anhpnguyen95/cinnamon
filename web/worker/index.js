// Cinnamon reminder server (Cloudflare Worker + D1).
// Stores, per phone, a push subscription and a list of upcoming reminder times with generic
// text (never medicine names), and sends each one when it is due. It also relays chat
// questions to Claude (worker/chat.js) without storing them. Static files come from ./public.

import { generateVapidKeys, sendPush } from './webpush.js';
import { handleChat } from './chat.js';

const SUBJECT = 'mailto:cinnamon@example.com';
const DEVICE = /^[0-9a-f-]{36}$/;
const MAX_ITEMS = 400;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });

async function vapidKeys(env) {
  const row = await env.DB.prepare("SELECT value FROM config WHERE key = 'vapid'").first();
  if (row) return JSON.parse(row.value);
  const keys = await generateVapidKeys();
  await env.DB.prepare("INSERT OR IGNORE INTO config (key, value) VALUES ('vapid', ?)").bind(JSON.stringify(keys)).run();
  // Another request may have won the race; always return what is stored.
  const stored = await env.DB.prepare("SELECT value FROM config WHERE key = 'vapid'").first();
  return JSON.parse(stored.value);
}

function validSubscription(s) {
  return s && typeof s.endpoint === 'string' && s.endpoint.startsWith('https://') && s.keys?.p256dh && s.keys?.auth;
}

async function handleApi(request, env, url) {
  if (url.pathname === '/api/config' && request.method === 'GET') {
    return json({ vapidPublicKey: (await vapidKeys(env)).publicKey });
  }

  const match = url.pathname.match(/^\/api\/devices\/([^/]+)(?:\/(subscription|reminders|test|chat))?$/);
  if (!match || !DEVICE.test(match[1])) return json({ error: 'not found' }, 404);
  const [, device, action] = match;
  const now = Date.now();

  if (action === 'subscription' && request.method === 'PUT') {
    const subscription = await request.json();
    if (!validSubscription(subscription)) return json({ error: 'bad subscription' }, 400);
    await env.DB.prepare(
      'INSERT INTO devices (id, subscription, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(id) DO UPDATE SET subscription = ?2, updated_at = ?3',
    )
      .bind(device, JSON.stringify(subscription), now)
      .run();
    return json({ ok: true });
  }

  if (action === 'reminders' && request.method === 'PUT') {
    const { items } = await request.json();
    if (!Array.isArray(items) || items.length > MAX_ITEMS) return json({ error: 'bad items' }, 400);
    const clean = items
      .filter((i) => typeof i.id === 'string' && Number.isFinite(i.at) && typeof i.title === 'string' && typeof i.body === 'string')
      .map((i) => ({ id: i.id.slice(0, 200), at: Math.round(i.at), title: i.title.slice(0, 120), body: i.body.slice(0, 300), url: String(i.url || './').slice(0, 300) }));
    const statements = [env.DB.prepare('DELETE FROM reminders WHERE device_id = ? AND sent_at IS NULL').bind(device)];
    for (const i of clean) {
      statements.push(
        env.DB.prepare('INSERT OR IGNORE INTO reminders (device_id, id, at, title, body, url) VALUES (?, ?, ?, ?, ?, ?)').bind(device, i.id, i.at, i.title, i.body, i.url),
      );
    }
    await env.DB.batch(statements);
    return json({ ok: true, count: clean.length });
  }

  if (action === 'chat' && request.method === 'POST') {
    return handleChat(request, env, device, { now });
  }

  if (action === 'test' && request.method === 'POST') {
    const row = await env.DB.prepare('SELECT subscription FROM devices WHERE id = ?').bind(device).first();
    if (!row?.subscription) return json({ error: 'no subscription' }, 409);
    const status = await sendPush(
      JSON.parse(row.subscription),
      { title: 'Cinnamon', body: 'Thông báo đã hoạt động. Cinnamon sẽ nhắc bạn uống thuốc đúng giờ.', url: './' },
      await vapidKeys(env),
      SUBJECT,
    );
    return json({ ok: status >= 200 && status < 300, status });
  }

  if (!action && request.method === 'DELETE') {
    await env.DB.batch([
      env.DB.prepare('DELETE FROM reminders WHERE device_id = ?').bind(device),
      env.DB.prepare('DELETE FROM devices WHERE id = ?').bind(device),
    ]);
    return json({ ok: true });
  }

  return json({ error: 'not found' }, 404);
}

/** Sends everything due in the last 30 minutes that hasn't gone out yet. */
export async function sendDue(env, now = Date.now(), fetchImpl = fetch) {
  const { results } = await env.DB.prepare(
    `SELECT r.device_id, r.id, r.title, r.body, r.url, d.subscription
       FROM reminders r JOIN devices d ON d.id = r.device_id
      WHERE r.sent_at IS NULL AND r.at <= ?1 AND r.at > ?2 AND d.subscription IS NOT NULL
      ORDER BY r.at LIMIT 100`,
  )
    .bind(now, now - 30 * 60_000)
    .all();
  if (!results.length) return 0;

  const vapid = await vapidKeys(env);
  const updates = [];
  for (const r of results) {
    let status = 0;
    try {
      status = await sendPush(JSON.parse(r.subscription), { title: r.title, body: r.body, url: r.url, tag: r.id.split('#')[0] }, vapid, SUBJECT, fetchImpl);
    } catch {
      status = 0;
    }
    updates.push(env.DB.prepare('UPDATE reminders SET sent_at = ? WHERE device_id = ? AND id = ?').bind(now, r.device_id, r.id));
    if (status === 404 || status === 410) {
      updates.push(env.DB.prepare('UPDATE devices SET subscription = NULL WHERE id = ?').bind(r.device_id));
    }
  }
  updates.push(env.DB.prepare('DELETE FROM reminders WHERE at < ?').bind(now - 7 * 24 * 3600_000));
  await env.DB.batch(updates);
  return results.length;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      try {
        return await handleApi(request, env, url);
      } catch (error) {
        return json({ error: 'server error' }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },

  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDue(env, event.scheduledTime));
  },
};
