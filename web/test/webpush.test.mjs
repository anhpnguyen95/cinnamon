import assert from 'node:assert/strict';
import { createECDH, createPublicKey, randomBytes, verify } from 'node:crypto';
import { test } from 'node:test';
import ece from 'http_ece';
import { b64url, encryptPayload, fromB64url, generateVapidKeys, sendPush, vapidAuthorization } from '../worker/webpush.js';

function fakeBrowserSubscription() {
  const ua = createECDH('prime256v1');
  ua.generateKeys();
  const auth = randomBytes(16);
  return {
    ua,
    auth,
    subscription: {
      endpoint: 'https://web.push.apple.com/QAbc123',
      keys: { p256dh: b64url(ua.getPublicKey()), auth: b64url(auth) },
    },
  };
}

test('payload decrypts with the reference http_ece implementation', async () => {
  const { ua, auth, subscription } = fakeBrowserSubscription();
  const message = JSON.stringify({ title: 'Đến giờ uống thuốc', body: 'Sau bữa trưa · 3 viên' });
  const body = await encryptPayload(subscription, message);
  const plain = ece.decrypt(Buffer.from(body), { version: 'aes128gcm', privateKey: ua, authSecret: Buffer.from(auth) });
  assert.equal(plain.toString('utf8'), message);
});

test('VAPID header is a valid ES256 JWT for the push service origin', async () => {
  const vapid = await generateVapidKeys();
  const header = await vapidAuthorization('https://web.push.apple.com/QAbc123', vapid, 'mailto:test@example.com');
  const [, token, key] = header.match(/^vapid t=([^,]+), k=(.+)$/);
  assert.equal(key, vapid.publicKey);
  const [h, c, s] = token.split('.');
  const claims = JSON.parse(Buffer.from(fromB64url(c)).toString());
  assert.equal(claims.aud, 'https://web.push.apple.com');
  assert.ok(claims.exp > Date.now() / 1000);
  const publicKey = createPublicKey({ key: { ...vapid.privateJwk, d: undefined, key_ops: undefined }, format: 'jwk' });
  const ok = verify('sha256', Buffer.from(`${h}.${c}`), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(fromB64url(s)));
  assert.ok(ok);
});

test('sendPush posts encrypted body with the right headers', async () => {
  const { subscription } = fakeBrowserSubscription();
  const vapid = await generateVapidKeys();
  let seen;
  const status = await sendPush(subscription, { title: 't', body: 'b' }, vapid, 'mailto:x@example.com', async (url, init) => {
    seen = { url, init };
    return new Response(null, { status: 201 });
  });
  assert.equal(status, 201);
  assert.equal(seen.url, subscription.endpoint);
  assert.equal(seen.init.headers['Content-Encoding'], 'aes128gcm');
  assert.equal(seen.init.headers.TTL, '3600');
  assert.ok(seen.init.headers.Authorization.startsWith('vapid t='));
});
