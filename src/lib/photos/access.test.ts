import { describe, expect, it } from "vitest";
import { decidePhotoAccess, photoHeaders } from "./access";

const viewer = (over: Partial<Parameters<typeof decidePhotoAccess>[0]["viewer"]> = {}) => ({
  signedIn: true,
  isSuperAdmin: false,
  isOrgMember: true,
  isChannelMember: false,
  ...over,
});

describe("decidePhotoAccess", () => {
  it("public album photos are open to anyone", () => {
    const r = decidePhotoAccess({
      albumVisibility: "public",
      isChatPhoto: false,
      viewer: viewer({ signedIn: false, isOrgMember: false }),
    });
    expect(r.ok).toBe(true);
  });

  it("members-only album photos need unit membership", () => {
    expect(
      decidePhotoAccess({ albumVisibility: "members", isChatPhoto: false, viewer: viewer() }).ok,
    ).toBe(true);
    expect(
      decidePhotoAccess({
        albumVisibility: "members",
        isChatPhoto: false,
        viewer: viewer({ isOrgMember: false }),
      }).ok,
    ).toBe(false);
  });

  it("a unit member who isn't in the chat can't open its photos", () => {
    const r = decidePhotoAccess({ albumVisibility: null, isChatPhoto: true, viewer: viewer() });
    expect(r).toEqual({ ok: false, status: 403 });
  });

  it("a chat member can open the chat's photos", () => {
    const r = decidePhotoAccess({
      albumVisibility: null,
      isChatPhoto: true,
      viewer: viewer({ isChannelMember: true }),
    });
    expect(r.ok).toBe(true);
  });
});

describe("photoHeaders", () => {
  it("serves allow-listed images inline with nosniff", () => {
    const h = photoHeaders("image/png", 10);
    expect(h["Content-Type"]).toBe("image/png");
    expect(h["Content-Disposition"]).toBe("inline");
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("forces anything else to download as bytes", () => {
    const h = photoHeaders("text/html", 10);
    expect(h["Content-Type"]).toBe("application/octet-stream");
    expect(h["Content-Disposition"]).toBe("attachment");
    expect(h["Content-Security-Policy"]).toContain("sandbox");
  });
});
