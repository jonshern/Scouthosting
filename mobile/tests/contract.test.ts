// The app's adapters from what /api/v1 sends to what the screens read.
// Each wire sample is copied from the server route's json(...) call, so
// a server change that breaks a screen shows up here.

import { describe, expect, it } from 'vitest';
import { slotStatus, toEventDetail, type EventDetailWire, type EventSlot } from '../src/api/events';
import { toFeedPost } from '../src/api/posts';
import { channelTitle } from '../src/api/types';
import { greetingFor } from '../src/api/dashboard';
import { unsignedSlipsFor, type MyScout } from '../src/api/scouts';
import { uploadSource, setServerAddress } from '../src/api/config';

const wireEvent: EventDetailWire = {
  id: 'e1',
  title: 'Canoe trip',
  description: null,
  startsAt: '2026-11-01T14:00:00.000Z',
  endsAt: null,
  allDay: false,
  location: 'Lake',
  locationAddress: null,
  category: 'campout',
  categoryLabel: 'Campout',
  color: 'accent',
  categoryColor: 'var(--accent)',
  categoryInk: 'var(--ink)',
  cost: 25,
  capacity: 12,
  signupRequired: true,
  rsvpSummary: { yes: 3, no: 1, maybe: 2, guests: 4 },
  myRsvp: { id: 'r1', response: 'yes', guests: 1, notes: 'Bringing the trailer' },
  slots: [],
  permissionSlip: { required: true, text: 'Sam may go.' },
};

describe('toEventDetail', () => {
  it('maps rsvpSummary to the counts the screen reads', () => {
    const e = toEventDetail(wireEvent);
    expect(e.rsvps).toEqual({ yes: 3, no: 1, maybe: 2 });
    expect(e.myRsvp).toEqual({ response: 'yes', guests: 1, notes: 'Bringing the trailer' });
    expect(e.permissionSlip).toEqual({ required: true, text: 'Sam may go.' });
  });

  it('copes with an older server that sends no slots or slip', () => {
    const { slots: _s, permissionSlip: _p, ...old } = wireEvent;
    const e = toEventDetail({ ...old, myRsvp: null });
    expect(e.slots).toEqual([]);
    expect(e.permissionSlip).toEqual({ required: false, text: null });
    expect(e.myRsvp).toBeNull();
  });
});

describe('slotStatus', () => {
  const slot = (over: Partial<EventSlot>): EventSlot => ({
    id: 's', key: null, title: 'Driver', description: null, capacity: 3,
    allowWaitlist: false, active: 0, waitlisted: 0, mine: null, ...over,
  });
  it('says where the slot stands', () => {
    expect(slotStatus(slot({ active: 1 }))).toBe('2 of 3 open');
    expect(slotStatus(slot({ active: 3 }))).toBe('Full');
    expect(slotStatus(slot({ active: 3, allowWaitlist: true, waitlisted: 2 }))).toBe('Full · 2 waiting');
    expect(slotStatus(slot({ mine: 'active', active: 1 }))).toBe("You're signed up");
    expect(slotStatus(slot({ mine: 'waitlisted' }))).toBe("You're on the waitlist");
  });
});

describe('toFeedPost', () => {
  it('turns the author object into a name and fills missing lists', () => {
    const p = toFeedPost({
      id: 'p', title: 'Hi', body: 'b', pinned: false, publishedAt: '2026-10-01T00:00:00Z',
      author: { id: 'u', displayName: 'Pat Lee' },
    });
    expect(p.author).toBe('Pat Lee');
    expect(p.photos).toEqual([]);
    expect(p.reactions).toEqual({ likes: 0, bookmarks: 0, youLiked: false, youBookmarked: false });
    expect(toFeedPost({ ...p, author: null }).author).toBeNull();
  });
});

describe('channelTitle', () => {
  it("shows the other person's name for a DM", () => {
    expect(channelTitle({ kind: 'dm', name: 'dm:a:b', dmCounterpartyName: 'Pat Lee' })).toBe('Pat Lee');
    expect(channelTitle({ kind: 'dm', name: 'dm:a:b' })).toBe('Direct message');
    expect(channelTitle({ kind: 'troop', name: 'Troop 100' })).toBe('Troop 100');
  });
});

describe('greetingFor', () => {
  it('picks the time of day', () => {
    expect(greetingFor(new Date(2026, 9, 12, 8)).phase).toBe('Good morning');
    expect(greetingFor(new Date(2026, 9, 12, 13)).phase).toBe('Good afternoon');
    expect(greetingFor(new Date(2026, 9, 12, 20)).phase).toBe('Good evening');
  });
});

describe('unsignedSlipsFor', () => {
  const scout = (orgId: string, signed: boolean): MyScout => ({
    orgId, orgSlug: 't', orgDisplayName: 'T', memberId: `${orgId}-${signed}`, scoutName: 'Sam',
    patrol: null, position: null, balanceCents: null,
    upcoming: [{ eventId: 'e1', title: 'Trip', startsAt: '', location: null, rsvp: null, requiresPermissionSlip: true, slipSigned: signed }],
  });
  it('keeps this unit\'s scouts whose slip is unsigned', () => {
    const out = unsignedSlipsFor([scout('o1', false), scout('o1', true), scout('o2', false)], 'o1', 'e1');
    expect(out.map((s) => s.memberId)).toEqual(['o1-false']);
  });
});

describe('uploadSource', () => {
  it('points at the current server and sends the token', () => {
    setServerAddress('https://mac.ts.net');
    expect(uploadSource('org1/a b.jpg', 'tok')).toEqual({
      uri: 'https://mac.ts.net/uploads/org1/a%20b.jpg',
      headers: { Authorization: 'Bearer tok' },
    });
    expect(uploadSource('x.jpg', null)).toEqual({ uri: 'https://mac.ts.net/uploads/x.jpg' });
    setServerAddress(null);
  });
});
