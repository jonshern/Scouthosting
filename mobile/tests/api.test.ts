// Mobile API client tests. Pure-JS — no react-native runtime, no real
// network. We inject a fetch mock + an in-memory storage so the auth
// flow can be exercised against synthetic responses.

import { describe, it, expect, beforeEach } from 'vitest';
import { ApiError, apiRequest } from '../src/api/client';
import { hostForOrg, APEX_DOMAIN } from '../src/api/config';
import { listChannels, getChannel, sendMessage } from '../src/api/channels';
import { parseCallback, persistSignIn } from '../src/api/auth';
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

describe('hostForOrg', () => {
  it('builds <slug>.<apex> in the absence of a baseUrl override', () => {
    expect(hostForOrg('troop12', { baseUrl: undefined })).toBe(`https://troop12.${APEX_DOMAIN}`);
  });

  it('uses the override when provided (dev / staging)', () => {
    expect(hostForOrg('troop12', { baseUrl: 'http://localhost:3000' })).toBe('http://localhost:3000');
  });

  it('strips a trailing slash from the override', () => {
    expect(hostForOrg('troop12', { baseUrl: 'http://localhost:3000/' })).toBe('http://localhost:3000');
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
    expect(calls[0].url).toContain('/api/v1/channels');
    const headers = (calls[0].init.headers || {}) as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer compass_pat_test');
  });

  it('appends query parameters', async () => {
    const { fn, calls } = makeFetch(() => ({ body: {} }));
    await apiRequest(opts({ fetchImpl: fn }), '/channels', { query: { orgId: 'org1' } });
    expect(calls[0].url).toMatch(/\?orgId=org1/);
  });

  it('serializes a JSON body and sets Content-Type', async () => {
    const { fn, calls } = makeFetch(() => ({ body: {} }));
    await apiRequest(opts({ fetchImpl: fn }), '/x', { method: 'POST', body: { a: 1 } });
    const init = calls[0].init;
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
    expect(calls[0].url).toContain('/channels?orgId=org1');
  });

  it('getChannel hits /channels/:id', async () => {
    const { fn, calls } = makeFetch(() => ({
      body: { channel: { id: 'c1' } as any, messages: [], hasMore: false } as ChannelDetailResponse,
    }));
    const r = await getChannel(opts({ fetchImpl: fn }), 'c1');
    expect(calls[0].url).toContain('/channels/c1');
    expect(r.channel.id).toBe('c1');
  });

  it('sendMessage POSTs the body', async () => {
    const { fn, calls } = makeFetch(() => ({
      status: 201,
      body: { message: { id: 'm1', body: 'hi', author: null, channelId: 'c1', createdAt: '', deleted: false, editedAt: null, pinned: false } },
    }));
    const r = await sendMessage(opts({ fetchImpl: fn }), 'c1', 'hi');
    expect(calls[0].init.method).toBe('POST');
    expect(calls[0].init.body).toBe(JSON.stringify({ body: 'hi' }));
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
