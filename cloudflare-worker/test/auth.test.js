import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker.js';

const env = { GOOGLE_OAUTH_CLIENT_ID: 'test-client-id' };

class FakeKV {
  constructor(entries = {}) { this.entries = new Map(Object.entries(entries)); }
  async get(key, type) {
    const value = this.entries.get(key) ?? null;
    return type === 'json' && value ? JSON.parse(value) : value;
  }
  async put(key, value) { this.entries.set(key, value); }
  async delete(key) { this.entries.delete(key); }
}

test('GET /api/auth/me rejects a missing session', async () => {
  const response = await worker.fetch(new Request('https://example.test/api/auth/me'), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'Missing or expired session');
});

test('POST /api/auth/google rejects an invalid ID token', async () => {
  const response = await worker.fetch(new Request('https://example.test/api/auth/google', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ credential: 'not-a-jwt' })
  }), env);
  assert.equal(response.status, 401);
  assert.equal((await response.json()).error, 'Invalid Google ID token');
});

test('POST /api/auth/logout expires app_session', async () => {
  const response = await worker.fetch(new Request('https://example.test/api/auth/logout', { method: 'POST' }), env);
  assert.equal(response.status, 204);
  assert.match(response.headers.get('set-cookie'), /^app_session=; Path=\/; HttpOnly; Secure; SameSite=Lax; Max-Age=0$/);
});

test('GET /api/auth/me restores a server-side KV session and role', async () => {
  const accessStore = new FakeKV({
    'b2b:access:users': JSON.stringify([{ email: 'anil.kumar@curefit.com', role: 'admin' }]),
    'app:session:session-1': JSON.stringify({ id: 'google-sub-1', email: 'anil.kumar@curefit.com', role: 'admin', expiresAt: Math.floor(Date.now() / 1000) + 60 })
  });
  const response = await worker.fetch(new Request('https://example.test/api/auth/me', { headers: { cookie: 'app_session=session-1' } }), { ...env, ACCESS_STORE: accessStore });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true, user: { id: 'google-sub-1', email: 'anil.kumar@curefit.com', role: 'admin', canView: true, canEdit: true, isAdmin: true, visibleTabs: ['overview', 'forecast', 'cat-media', 'cat-services', 'cat-brand', 'cat-engagement', 'cat-events', 'spends', 'payments', 'vendors', 'budget', 'access'] } });
});
