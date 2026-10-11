import { describe, expect, it } from "vitest";
import {
  AddStaffSchema,
  PatchStaffSchema,
  StaffRsvpSchema,
  TokenRsvpSchema,
  hashStaffToken,
  newStaffToken,
  originFromHeaders,
  renderStaffInvite,
  staffDto,
  staffRsvpUrl,
} from "./staff";
import { AnnounceSchema, CreateChannelSchema } from "./messaging";

const code = (r: { success: boolean; error?: { issues: Array<{ message: string }> } }) =>
  r.success ? null : r.error!.issues[0].message;

describe("AddStaffSchema", () => {
  it("lowercases and trims the email", () => {
    const r = AddStaffSchema.parse({ name: " Pat ", email: " Pat@Example.COM ", role: "counselor" });
    expect(r).toMatchObject({ name: "Pat", email: "pat@example.com", role: "counselor" });
  });

  it("names its errors with API codes", () => {
    expect(code(AddStaffSchema.safeParse({ name: "P", email: "nope", role: "counselor" }))).toBe("bad_email");
    expect(code(AddStaffSchema.safeParse({ name: "", email: "a@b.co", role: "counselor" }))).toBe("missing_name");
    expect(code(AddStaffSchema.safeParse({ name: "P", email: "a@b.co", role: "scoutmaster" }))).toBe("bad_role");
  });

  it("rejects ids that aren't ids", () => {
    expect(AddStaffSchema.safeParse({ name: "P", email: "a@b.co", role: "staff", slotId: "../x" }).success).toBe(false);
  });

  it("accepts every role", () => {
    for (const role of ["counselor", "staff", "volunteer", "lead"]) {
      expect(AddStaffSchema.safeParse({ name: "P", email: "a@b.co", role }).success).toBe(true);
    }
  });
});

describe("PatchStaffSchema", () => {
  it("refuses an empty patch", () => {
    expect(code(PatchStaffSchema.safeParse({}))).toBe("empty_patch");
  });
  it("allows clearing the station with null", () => {
    expect(PatchStaffSchema.parse({ slotId: null })).toEqual({ slotId: null });
  });
  it("lets leaders put a row back to invited", () => {
    expect(PatchStaffSchema.parse({ status: "invited" })).toEqual({ status: "invited" });
    expect(code(PatchStaffSchema.safeParse({ status: "attending" }))).toBe("bad_status");
  });
});

describe("staff RSVP schemas", () => {
  it("only take yes / no / maybe from staff", () => {
    expect(StaffRsvpSchema.safeParse({ status: "yes" }).success).toBe(true);
    expect(code(StaffRsvpSchema.safeParse({ status: "invited" }))).toBe("bad_status");
  });
  it("reject junk tokens before any lookup", () => {
    expect(code(TokenRsvpSchema.safeParse({ token: "short", status: "yes" }))).toBe("invalid_token");
    expect(code(TokenRsvpSchema.safeParse({ token: "x".repeat(30) + "!", status: "yes" }))).toBe("invalid_token");
    expect(TokenRsvpSchema.safeParse({ token: newStaffToken(), status: "no" }).success).toBe(true);
  });
});

describe("tokens", () => {
  it("are random, URL-safe, and only their hash is kept", () => {
    const a = newStaffToken();
    const b = newStaffToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(hashStaffToken(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashStaffToken(a)).toBe(hashStaffToken(a));
    expect(hashStaffToken(a)).not.toContain(a);
  });
});

describe("staffDto", () => {
  it("exposes the station as { slotId, key, title }", () => {
    const base = {
      id: "s1",
      name: "Pat",
      email: "pat@example.com",
      phone: null,
      role: "counselor",
      status: "yes",
      notes: null,
      counselorId: null,
      respondedAt: null,
    };
    expect(staffDto({ ...base, slot: { id: "slot1", title: "First Aid" } }).station).toEqual({
      slotId: "slot1",
      key: "station:slot1",
      title: "First Aid",
    });
    expect(staffDto({ ...base, slot: null }).station).toBeNull();
    expect(JSON.stringify(staffDto({ ...base, slot: null }))).not.toContain("rsvpTokenHash");
  });
});

describe("invite email", () => {
  it("escapes names and links to /staff-rsvp", () => {
    const url = staffRsvpUrl("https://troop1.compass.app/", "tok");
    expect(url).toBe("https://troop1.compass.app/staff-rsvp?token=tok");
    const { subject, html } = renderStaffInvite({
      name: "<script>",
      role: "counselor",
      eventTitle: "Badge Day",
      eventWhen: "Sat",
      eventWhere: null,
      stationTitle: "First Aid",
      url,
    });
    expect(subject).toBe("Can you help at Badge Day?");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Counselor");
    expect(html).toContain("First Aid");
    expect(html).toContain(url);
  });

  it("builds the origin from the Host header", () => {
    expect(originFromHeaders(new Headers({ host: "localhost:3000" }))).toBe("http://localhost:3000");
    expect(originFromHeaders(new Headers({ host: "t.compass.app", "x-forwarded-proto": "https" }))).toBe(
      "https://t.compass.app",
    );
  });
});

describe("messaging schemas", () => {
  it("need a station for station channels and emails", () => {
    expect(code(CreateChannelSchema.safeParse({ audience: "station" }))).toBe("missing_slot");
    expect(CreateChannelSchema.safeParse({ audience: "station", slotId: "abc" }).success).toBe(true);
    expect(code(CreateChannelSchema.safeParse({ audience: "everyone" }))).toBe("bad_audience");
    expect(code(AnnounceSchema.safeParse({ scope: "station", subject: "s", body: "b" }))).toBe("missing_slot");
    expect(code(AnnounceSchema.safeParse({ scope: "staff", subject: "", body: "b" }))).toBe("missing_subject");
    expect(AnnounceSchema.safeParse({ scope: "families", subject: "s", body: "b" }).success).toBe(true);
  });
});
