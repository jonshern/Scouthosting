// Template: Classic Troop
//
// Inspired by Troop 567 New Hope's site — a familiar, warm, scout-y
// homepage layout that works for almost any unit. Big intro about the
// troop, upcoming events, recent photos, latest posts, contact card.
// Custom pages for "Forms & Documents", "Our Adult Leaders", and
// "Resource Links" so the four-item nav we see in the wild lights up.

import crypto from "node:crypto";

const id = (prefix) => `${prefix}_${crypto.randomBytes(5).toString("hex")}`;

export const classicTroop = {
  key: "classic-troop",
  label: "Classic Troop",
  tagline: "Welcoming intro · upcoming events · photos · forms",
  bestFor: ["troop", "pack", "crew", "ship"],
  thumbnail: null, // TODO: ship thumbnail.png in admin/

  describe(org) {
    return (
      `A familiar layout: a warm welcome paragraph, an upcoming-events list ` +
      `that updates from your calendar, recent photos from your albums, and ` +
      `a contact card. Plus three starter pages — Forms & Documents, Our ` +
      `Leaders, Resource Links — that you can edit or remove later.`
    );
  },

  build(org) {
    const unitName = org.displayName || `${org.unitType || "Unit"} ${org.unitNumber || ""}`.trim();
    const cityState = [org.city, org.state].filter(Boolean).join(", ");
    const charter = org.charterOrg || "our chartered organization";
    const council = org.council || "our council";

    // Block IDs are stable per template instance; if the admin re-applies
    // the template we want the same IDs so sectionOrder references survive.
    // Random per-call is fine here because we overwrite both customBlocks
    // and sectionOrder atomically — they always come in pairs.
    const heroBlockId = id("cb_hero"); // reserved for future hero block
    const eventsId = id("cb_events");
    const photosId = id("cb_photos");
    const postsId = id("cb_posts");
    const contactId = id("cb_contact");
    const aboutBlockId = id("cb_about");
    const ctaBlockId = id("cb_cta");

    // The standard hero / about / etc. sections are still in DEFAULT_ORDER
    // — we let the unit page render them at the top. Below those, our
    // custom block lineup kicks in. Section order: built-in hero, then
    // our about-text block, then live events / photos / posts / contact.
    const customBlocks = [
      {
        id: aboutBlockId,
        type: "text",
        title: `About ${unitName}`,
        body:
          `**${unitName}** is sponsored by ${charter}` +
          (cityState ? ` in ${cityState}` : "") +
          `. We are part of ${council}` +
          (org.district ? ` (${org.district})` : "") +
          `.\n\n` +
          `New families welcome — drop in on a meeting any time. ` +
          `We meet ${org.meetingDay ? org.meetingDay + "s" : "weekly"}` +
          (org.meetingTime ? ` at ${org.meetingTime}` : "") +
          (org.meetingLocation ? ` at ${org.meetingLocation}` : "") +
          `.`,
      },
      {
        id: eventsId,
        type: "events",
        config: { limit: 5, layout: "list" },
      },
      {
        id: photosId,
        type: "photos",
        config: { mode: "latest", limit: 8, layout: "grid" },
      },
      {
        id: postsId,
        type: "posts",
        config: { limit: 3, layout: "excerpt" },
      },
      {
        id: ctaBlockId,
        type: "cta",
        title: "Curious? Come visit.",
        body:
          `Any Scout-aged youth is welcome to drop in on a ${
            org.meetingDay || "meeting"
          } night. Wear comfortable clothes — closed-toe shoes are smart.`,
        buttonLabel: "Email the leader",
        buttonLink: org.scoutmasterEmail
          ? `mailto:${org.scoutmasterEmail}`
          : "#contact",
      },
      {
        id: contactId,
        type: "contact",
        config: { layout: "card", showMap: true },
      },
    ];

    // sectionOrder mixes built-in section keys with block:<id> entries.
    // We hide the built-in upcoming/posts/albums sections because our
    // live blocks now handle them — otherwise they'd render twice.
    const sectionOrder = [
      "hero",
      `block:${aboutBlockId}`,
      `block:${eventsId}`,
      `block:${photosId}`,
      `block:${postsId}`,
      `block:${ctaBlockId}`,
      `block:${contactId}`,
    ];
    const sectionVisibility = {
      // Hide built-in duplicates that are now handled by live blocks.
      about: false,
      whatWeDo: false,
      upcoming: false,
      posts: false,
      albums: false,
      testimonials: false,
      join: false,
      contact: false,
    };

    return {
      page: {
        heroHeadline:
          `Adventure, leadership, and the outdoors${
            org.founded ? ` — since ${org.founded}` : ""
          }.`,
        heroLede:
          `Welcome to ${unitName}${cityState ? ` — based in ${cityState}` : ""}. ` +
          `We're a ${org.unitType || "Scouting"} unit chartered by ${charter}.`,
        // The block-based template doesn't use these legacy single-string
        // fields, but we set sensible defaults so a future "switch to the
        // built-in sections" toggle has good content to fall back on.
        aboutBody: `${unitName} is sponsored by ${charter}${cityState ? ` in ${cityState}` : ""}.`,
        joinBody:
          `Any Scout-aged youth is welcome to drop in on a ${
            org.meetingDay || "weekly"
          } meeting${org.meetingLocation ? ` at ${org.meetingLocation}` : ""}.`,
        contactNote: `Questions before you visit? Email${
          org.scoutmasterName ? ` ${org.scoutmasterName}` : " us"
        } — we usually reply within a day.`,
        customBlocks,
        sectionOrder,
        sectionVisibility,
      },
      customPages: [
        {
          slug: "forms-and-documents",
          title: "Forms & Documents",
          body:
            `Permission slips, medical forms, and the bylaws live here.\n\n` +
            `_Edit this page in the admin to add the actual files. We'll show ` +
            `up everything you upload under **Forms** (in the admin)._`,
          visibility: "public",
          showInNav: true,
          sortOrder: 1,
        },
        {
          slug: "our-leaders",
          title: "Our Leaders",
          body:
            `Meet the volunteers who make ${unitName} run.\n\n` +
            `_Edit this page in the admin to introduce your scoutmaster, ` +
            `assistant scoutmasters, committee chair, and other key adults. ` +
            `(A live "leaders directory" block is on the roadmap.)_`,
          visibility: "public",
          showInNav: true,
          sortOrder: 2,
        },
        {
          slug: "resources",
          title: "Resource Links",
          body:
            `Helpful links for new families.\n\n` +
            `- [Council site](${org.council ? "https://" : "#"})\n` +
            `- [Scouting America national](https://www.scouting.org)\n` +
            `- [Scoutbook (advancement)](https://scoutbook.scouting.org)\n\n` +
            `_Edit this page in the admin to add your own links._`,
          visibility: "public",
          showInNav: true,
          sortOrder: 3,
        },
      ],
    };
  },
};
