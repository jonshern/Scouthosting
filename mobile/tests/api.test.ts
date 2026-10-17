// Mobile API client tests. Pure-JS — no react-native runtime, no real
// network. We inject a fetch mock + an in-memory storage so the auth
// flow can be exercised against synthetic responses.

import { describe, it, expect, afterEach } from 'vitest';
import { ApiError, apiRequest } from '../src/api/client';
import { apexBaseUrl, APEX_DOMAIN, BUILT_IN_SERVER, hostForOrg, serverAddress, setServerAddress } from '../src/api/config';
import { listChannels, getChannel, sendMessage } from '../src/api/channels';
import { deleteAccount, parseCallback, persistSignIn, signOut } from '../src/api/auth';
import { createMemoryStorage } from '../src/api/storage';
import type { ChannelsListResponse, ChannelDetailResponse, MeDto } from '../src/api/types';

type FetchCall = { url: string; init: RequestInit };

function makeFetch(responder: (call: FetchCall) => { status?: number; body?: unknown }): {
  fn: typeof fetch;
  calls: FetchCall[];
} {
  const calls: FetchCall[] = [];
  const fn = (async (url: any, init: RequestInit = {}) => {
    const u = url instanceof URL ? url.toString() : String(url);
    calls.push({ url: u, init });
    const r = responder({ url: u, init });
    return new Response(r.body !== undefined ? JSON.stringify(r.body) : null, {
      status: r.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const opts = (over: Partial<Parameters<typeof apiRequest>[0]> = {}) => ({
  orgSlug: 'troop12',
  token: 'compass_pat_test',
  ...over,
});

/* ------------------------------------------------------------------ */
/* hostForOrg                                                          */
/* ------------------------------------------------------------------ */

describe('server address', () => {
  afterEach(() => setServerAddress(null));

  it('defaults to https://<apex> when the build sets no address', () => {
    expect(BUILT_IN_SERVER).toBe(`https://${APEX_DOMAIN}`);
    expect(hostForOrg('troop12')).toBe(`https://${APEX_DOMAIN}`);
  });

  it('sends every org to the one server, since /api/v1 is host-agnostic', () => {
    setServerAddress('https://jons-mac.tail1234.ts.net');
    expect(hostForOrg('troop12')).toBe('https://jons-mac.tail1234.ts.net');
    expect(hostForOrg('pack7')).toBe('https://jons-mac.tail1234.ts.net');
    expect(apexBaseUrl()).toBe('https://jons-mac.tail1234.ts.net');
    expect(serverAddress()).toBe('https://jons-mac.tail1234.ts.net');
  });

  it('goes back to the built-in address on null or junk', () => {
    setServerAddress('https://x.ts.net');
    setServerAddress(null);
    expect(serverAddress()).toBe(BUILT_IN_SERVER);
    setServerAddress('not a url at all ::');
    expect(serverAddress()).toBe(BUILT_IN_SERVER);
  });

  it('uses an explicit baseUrl override and strips its trailing slash', () => {
    expect(hostForOrg('troop12', { baseUrl: 'http://localhost:3000/' })).toBe('http://localhost:3000');
  });

  it('requests go to the current server', async () => {
    setServerAddress('https://jons-mac.tail1234.ts.net');
    const { fn, calls } = makeFetch(() => ({ body: {} }));
    await apiRequest(opts({ fetchImpl: fn }), '/auth/me');
    expect(calls[0]!.url).toBe('https://jons-mac.tail1234.ts.net/api/v1/auth/me');
  });
});

describe('signOut', () => {
  it('revokes the token that calls it, then forgets it locally', async () => {
    const storage = createMemoryStorage();
    await storage.setToken('compass_pat_test');
    const { fn, calls } = makeFetch(() => ({ body: { ok: true } }));
    await signOut(opts({ fetchImpl: fn, config: { baseUrl: 'http://localhost:3000' } }), storage);
    expect(calls[0]!.url).toBe('http://localhost:3000/api/v1/auth/token/current');
    expect(calls[0]!.init.method).toBe('DELETE');
    expect(await storage.getToken()).toBeNull();
  });

  it('still forgets the token when the server is unreachable', async () => {
    const storage = createMemoryStorage();
    await storage.setToken('compass_pat_test');
    const fn = (async () => { throw new TypeError('Network request failed'); }) as unknown as typeof fetch;
    await signOut(opts({ fetchImpl: fn }), storage);
    expect(await storage.getToken()).toBeNull();
  });
});

describe('deleteAccount', () => {
  const at = { baseUrl: 'http://localhost:3000' };

  it('sends the typed email and forgets the sign-in once the account is gone', async () => {
    const storage = createMemoryStorage();
    await storage.setToken('compass_pat_test');
    const { fn, calls } = makeFetch(() => ({ body: { ok: true } }));
    expect(await deleteAccount(opts({ fetchImpl: fn, config: at }), 'pat@example.com', storage)).toBeNull();
    expect(calls[0]!.url).toBe('http://localhost:3000/api/v1/me');
    expect(calls[0]!.init.method).toBe('DELETE');
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ confirm: 'pat@example.com' });
    expect(await storage.getToken()).toBeNull();
  });

  it('returns why it can\'t be deleted yet and stays signed in', async () => {
    const storage = createMemoryStorage();
    await storage.setToken('compass_pat_test');
    const { fn } = makeFetch(() => ({
      status: 409,
      body: {
        error: 'account_deletion_blocked',
        blockers: [{ kind: 'only_admin', orgName: 'Troop 12', message: "You're the only admin of Troop 12." }],
      },
    }));
    expect(await deleteAccount(opts({ fetchImpl: fn, config: at }), 'pat@example.com', storage)).toEqual([
      "You're the only admin of Troop 12.",
    ]);
    expect(await storage.getToken()).toBe('compass_pat_test');
  });
});

/* ------------------------------------------------------------------ */
/* apiRequest                                                           */
/* ------------------------------------------------------------------ */

describe('apiRequest', () => {
  it('hits /api/v1/<path> with the bearer token', async () => {
    const { fn, calls } = makeFetch(() => ({ body: { ok: true } }));
    await apiRequest(opts({ fetchImpl: fn }), '/channels');
    expect(calls).toHaveLength(1);
    const call = calls[0]!;
    expect(call.url).toContain('/api/v1/channels');
    const headers = (call.init.headers || {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer compass_pat_test');
  });

  it('appends query parameters', async () => {
    const { fn, calls } = makeFetch(() => ({ body: {} }));
    await apiRequest(opts({ fetchImpl: fn }), '/channels', { query: { orgId: 'org1' } });
    expect(calls[0]!.url).toMatch(/\?orgId=org1/);
  });

  it('serializes a JSON body and sets Content-Type', async () => {
    const { fn, calls } = makeFetch(() => ({ body: {} }));
    await apiRequest(opts({ fetchImpl: fn }), '/x', { method: 'POST', body: { a: 1 } });
    const init = calls[0]!.init;
    expect(init.method).toBe('POST');
    expect(init.body).toBe(JSON.stringify({ a: 1 }));
    expect((init.headers as Record<string, string>)['Content-Type']).toBe('application/json');
  });

  it('throws ApiError with the server-provided code on non-2xx', async () => {
    const { fn } = makeFetch(() => ({ status: 409, body: { error: 'channel_suspended', reason: 'no-current-adults' } }));
    await expect(apiRequest(opts({ fetchImpl: fn }), '/x', { method: 'POST', body: {} }))
      .rejects.toMatchObject({ name: 'ApiError', code: 'channel_suspended', status: 409 });
  });

  it('throws ApiError with http_<status> when the server returns no error code', async () => {
    const { fn } = makeFetch(() => ({ status: 503, body: null }));
    await expect(apiRequest(opts({ fetchImpl: fn }), '/x'))
      .rejects.toMatchObject({ status: 503, code: 'http_503' });
  });

  it('throws when the token is missing', async () => {
    const { fn } = makeFetch(() => ({ body: {} }));
    await expect(apiRequest({ orgSlug: 'troop12', token: '', fetchImpl: fn }, '/x'))
      .rejects.toBeInstanceOf(ApiError);
  });

  it('throws with a clear message when the orgSlug is missing', async () => {
    const { fn } = makeFetch(() => ({ body: {} }));
    await expect(apiRequest({ orgSlug: '', token: 't', fetchImpl: fn }, '/x'))
      .rejects.toThrow(/missing orgSlug/);
  });
});

/* ------------------------------------------------------------------ */
/* channels.ts wrappers                                                */
/* ------------------------------------------------------------------ */

describe('channels API wrappers', () => {
  it('listChannels passes orgId in the query', async () => {
    const { fn, calls } = makeFetch(() => ({ body: { channels: [] } as ChannelsListResponse }));
    await listChannels(opts({ fetchImpl: fn }), 'org1');
    expect(calls[0]!.url).toContain('/channels?orgId=org1');
  });

  it('getChannel hits /channels/:id', async () => {
    const { fn, calls } = makeFetch(() => ({
      body: { channel: { id: 'c1' } as any, messages: [], hasMore: false } as ChannelDetailResponse,
    }));
    const r = await getChannel(opts({ fetchImpl: fn }), 'c1');
    expect(calls[0]!.url).toContain('/channels/c1');
    expect(r.channel.id).toBe('c1');
  });

  it('sendMessage POSTs the body', async () => {
    const { fn, calls } = makeFetch(() => ({
      status: 201,
      body: { message: { id: 'm1', body: 'hi', author: null, channelId: 'c1', createdAt: '', deleted: false, editedAt: null, pinned: false } },
    }));
    const r = await sendMessage(opts({ fetchImpl: fn }), 'c1', 'hi');
    expect(calls[0]!.init.method).toBe('POST');
    expect(calls[0]!.init.body).toBe(JSON.stringify({ body: 'hi' }));
    expect(r.message.id).toBe('m1');
  });
});

/* ------------------------------------------------------------------ */
/* parseCallback                                                       */
/* ------------------------------------------------------------------ */

describe('parseCallback', () => {
  it('extracts token + userId + displayName from a deep-link URL', () => {
    const r = parseCallback('compass://auth/callback?token=compass_pat_xyz&userId=u1&displayName=Mason%20Park');
    expect(r).toEqual({ ok: true, token: 'compass_pat_xyz', userId: 'u1', displayName: 'Mason Park' });
  });

  it('returns missing_token when the token query is absent', () => {
    expect(parseCallback('compass://auth/callback?userId=u1')).toEqual({ ok: false, reason: 'missing_token' });
  });

  it('returns missing_token for a malformed URL', () => {
    expect(parseCallback(':::not a url')).toEqual({ ok: false, reason: 'missing_token' });
  });
});

/* ------------------------------------------------------------------ */
/* persistSignIn                                                       */
/* ------------------------------------------------------------------ */

describe('persistSignIn', () => {
  it('writes the token + a profile snapshot derived from /auth/me', async () => {
    const storage = createMemoryStorage();
    const me: MeDto = {
      user: { id: 'u1', email: 'm@example.com', displayName: 'Mason' },
      memberships: [
        { orgId: 'org1', orgSlug: 'troop12', orgName: 'Troop 12', role: 'parent' },
        { orgId: 'org2', orgSlug: 'pack577', orgName: 'Pack 577', role: 'parent' },
      ],
    };
    const profile = await persistSignIn(
      storage,
      { ok: true, token: 'compass_pat_xyz', userId: 'u1', displayName: 'Mason' },
      me,
    );
    expect(profile.userId).toBe('u1');
    expect(profile.activeOrgId).toBe('org1');
    expect(profile.orgs).toHaveLength(2);
    expect(await storage.getToken()).toBe('compass_pat_xyz');
    expect((await storage.getProfile())?.activeOrgId).toBe('org1');
  });
});
