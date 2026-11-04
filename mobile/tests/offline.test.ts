import { beforeEach, describe, expect, it } from 'vitest';
import { createRequire } from 'node:module';

import { apiRequest, ApiError } from '../src/api/client';
import { clearSaved, markOnline, offlineMessage, memoryStore, offlineStatus, saveAnswer, savedAnswer, setOfflineStore, MAX_ENTRIES } from '../src/api/offline';


const config = { baseUrl: 'https://compass.test' };
const client = { orgSlug: 'troop100', token: 't', config } as const;

const ok = (body: unknown) => (async () => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })) as typeof fetch;
const down = (async () => { throw new TypeError('Network request failed'); }) as typeof fetch;

beforeEach(() => {
  setOfflineStore(memoryStore());
  markOnline();
});

describe('offline copy', () => {
  it('saves a GET and shows it when the server cannot be reached', async () => {
    await apiRequest({ ...client, fetchImpl: ok({ events: [1, 2] }) } as never, '/orgs/o1/events');
    expect(offlineStatus().offline).toBe(false);
    const again = await apiRequest({ ...client, fetchImpl: down } as never, '/orgs/o1/events');
    expect(again).toEqual({ events: [1, 2] });
    expect(offlineStatus().offline).toBe(true);
    expect(offlineStatus().savedAt).not.toBeNull();
    // The next answer from the server clears it.
    await apiRequest({ ...client, fetchImpl: ok({ events: [] }) } as never, '/orgs/o1/events');
    expect(offlineStatus().offline).toBe(false);
  });

  it('says offline when nothing was saved', async () => {
    await expect(apiRequest({ ...client, fetchImpl: down } as never, '/channels')).rejects.toMatchObject({ code: 'offline', status: 0 });
    expect(offlineStatus()).toEqual({ offline: true, savedAt: null });
  });

  it('never fakes a write', async () => {
    await expect(apiRequest({ ...client, fetchImpl: down } as never, '/events/e1/rsvp', { method: 'POST', body: {} })).rejects.toBeInstanceOf(TypeError);
  });

  it('passes the server’s real errors through, so a revoked sign-in still signs out', async () => {
    await apiRequest({ ...client, fetchImpl: ok({ me: 1 }) } as never, '/auth/me');
    const unauthorized = (async () => new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 })) as typeof fetch;
    await expect(apiRequest({ ...client, fetchImpl: unauthorized } as never, '/auth/me')).rejects.toBeInstanceOf(ApiError);
  });

  it('keeps answers for each org and query apart', async () => {
    await apiRequest({ ...client, fetchImpl: ok({ a: 1 }) } as never, '/orgs/o1/events', { query: { from: '2026-11-01' } });
    await expect(apiRequest({ ...client, fetchImpl: down } as never, '/orgs/o1/events', { query: { from: '2026-12-01' } })).rejects.toMatchObject({ code: 'offline' });
  });

  it('drops the oldest answers past the limit, and everything on sign-out', async () => {
    for (let i = 0; i <= MAX_ENTRIES; i++) await saveAnswer(`u${i}`, i, 1000 + i);
    expect(await savedAnswer('u0')).toBeNull();
    expect(await savedAnswer(`u${MAX_ENTRIES}`)).toEqual({ body: MAX_ENTRIES, savedAt: 1000 + MAX_ENTRIES });
    await clearSaved();
    expect(await savedAnswer(`u${MAX_ENTRIES}`)).toBeNull();
  });

  it('tells the person how old the copy is', () => {
    const now = new Date(2026, 10, 3, 15, 0);
    expect(offlineMessage({ offline: false, savedAt: null }, now)).toBeNull();
    expect(offlineMessage({ offline: true, savedAt: null }, now)).toMatch(/Nothing saved/);
    expect(offlineMessage({ offline: true, savedAt: new Date(2026, 10, 3, 9, 5).getTime() }, now)).toMatch(/^Offline\. Showing what was saved at .*9:05/);
  });
});

describe('free-team builds', () => {
  const require = createRequire(import.meta.url);
  const make = require('../app.config.js');
  const base = require('../app.json').expo;

  it('leave out push notifications only when asked', () => {
    const named = (c: { plugins: unknown[] }) => c.plugins.map((p) => (Array.isArray(p) ? p[0] : p));
    process.env.COMPASS_IOS_NO_PUSH = '1';
    expect(named(make({ config: base }))).not.toContain('expo-notifications');
    delete process.env.COMPASS_IOS_NO_PUSH;
    expect(named(make({ config: base }))).toContain('expo-notifications');
    expect(named(make({ config: base }))).toContain('./plugins/with-ios-scene');
    expect(make.dropPushEntitlement({ 'aps-environment': 'development', other: 1 })).toEqual({ other: 1 });
  });

  it('sign push for production for TestFlight and keep the build number', () => {
    const push = (c: { plugins: unknown[] }) =>
      c.plugins.find((p) => Array.isArray(p) && p[0] === 'expo-notifications') as [string, Record<string, unknown>];
    process.env.COMPASS_IOS_PUSH_MODE = 'production';
    process.env.IOS_BUILD_NUMBER = '202611040500';
    const built = make({ config: base });
    expect(push(built)[1]).toMatchObject({ mode: 'production', color: '#1d4ed8' });
    expect(built.ios.buildNumber).toBe('202611040500');
    delete process.env.COMPASS_IOS_PUSH_MODE;
    delete process.env.IOS_BUILD_NUMBER;
    const plain = make({ config: base });
    expect(push(plain)[1].mode).toBeUndefined();
    expect(plain.ios.buildNumber).toBeUndefined();
  });
});
