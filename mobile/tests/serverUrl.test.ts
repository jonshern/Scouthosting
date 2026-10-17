import { describe, expect, it } from 'vitest';
import { connectLinkAddress, needsHttps, normalizeServerUrl } from '../src/api/serverUrl';

describe('normalizeServerUrl', () => {
  it('adds https:// to a bare host', () => {
    expect(normalizeServerUrl('jons-mac.tail1234.ts.net')).toBe('https://jons-mac.tail1234.ts.net');
  });
  it('keeps http and ports for local addresses', () => {
    expect(normalizeServerUrl('http://localhost:3000/')).toBe('http://localhost:3000');
  });
  it('drops a pasted /api or /api/v1 suffix', () => {
    expect(normalizeServerUrl('https://h.ts.net/api')).toBe('https://h.ts.net');
    expect(normalizeServerUrl('https://h.ts.net/api/v1/')).toBe('https://h.ts.net');
  });
  it('turns down things that are not server addresses', () => {
    expect(normalizeServerUrl('')).toBeNull();
    expect(normalizeServerUrl('   ')).toBeNull();
    expect(normalizeServerUrl('ftp://h.ts.net')).toBeNull();
    expect(normalizeServerUrl('https://user:pw@h.ts.net')).toBeNull();
    expect(normalizeServerUrl('javascript:alert(1)')).toBeNull();
  });
});

describe('needsHttps', () => {
  it('flags plain http to another machine', () => {
    expect(needsHttps('http://100.64.1.2:3000')).toBe(true);
  });
  it('allows https and local http', () => {
    expect(needsHttps('https://h.ts.net')).toBe(false);
    expect(needsHttps('http://localhost:3000')).toBe(false);
    expect(needsHttps('http://192.168.1.20:3000')).toBe(false);
  });
});

describe('connectLinkAddress', () => {
  it('reads the url from compass://connect?url=…', () => {
    expect(connectLinkAddress('compass://connect?url=https%3A%2F%2Fh.ts.net')).toBe('https://h.ts.net');
    expect(connectLinkAddress('exp://100.64.1.2:8081/--/connect?url=h.ts.net')).toBe('https://h.ts.net');
  });
  it('returns null without a usable url', () => {
    expect(connectLinkAddress('compass://connect')).toBeNull();
    expect(connectLinkAddress('compass://connect?url=')).toBeNull();
  });
});
