// Live block: contact card.
//
// Pulls org info (charter org, council, district, meeting day/time/
// location, scoutmaster name + email) and renders a contact card. No
// admin config — it just displays the org's settings, so updating
// /admin/settings is reflected here automatically.
//
// Optional config:
//   layout: "card" (default) — boxed two-column card
//           "inline" — single line of contact details
//   showMap: bool — link to Google Maps for the meeting location

const LAYOUTS = ["card", "inline"];

export const contactBlock = {
  type: "contact",
  label: "Contact card",
  description: "Auto-fills meeting day/time, location, and contact info.",
  defaults: { layout: "card", showMap: true },

  normalise(input) {
    // showMap default is true. Explicit false / "0" / "" turns it off.
    // Form checkboxes send "1" when checked and nothing when unchecked,
    // so unchecked → input.showMap is undefined → keeps the default.
    // Templates / API can still pass an explicit boolean.
    let showMap;
    if (input.showMap === false || input.showMap === "0" || input.showMap === "false") {
      showMap = false;
    } else if (input.showMap === undefined || input.showMap === null) {
      // Default. Note: form-submit "checkbox unchecked" hits this branch
      // so the default wins. To make a checkbox toggleable we'd add a
      // hidden "0" field next to it; not worth the complexity for this
      // single config option.
      showMap = true;
    } else {
      showMap = Boolean(input.showMap);
    }
    return {
      layout: LAYOUTS.includes(input.layout) ? input.layout : "card",
      showMap,
    };
  },

  async fetch({ orgId, prisma }) {
    const org = await prisma.org.findUnique({
      where: { id: orgId },
      select: {
        displayName: true,
        meetingDay: true,
        meetingTime: true,
        meetingLocation: true,
        charterOrg: true,
        council: true,
        district: true,
        scoutmasterName: true,
        scoutmasterEmail: true,
        committeeChairEmail: true,
        city: true,
        state: true,
      },
    });
    return { org };
  },

  render({ data, config, escapeHtml }) {
    const o = data?.org;
    if (!o) return "";
    const layout = LAYOUTS.includes(config.layout) ? config.layout : "card";

    const meetingLine =
      o.meetingDay && o.meetingTime
        ? `${o.meetingDay}s · ${o.meetingTime}`
        : o.meetingDay || o.meetingTime || "";
    const where = o.meetingLocation || o.charterOrg;
    const cityState = [o.city, o.state].filter(Boolean).join(", ");
    const mapHref =
      config.showMap && where
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
            [where, cityState].filter(Boolean).join(", "),
          )}`
        : null;

    if (layout === "inline") {
      const parts = [];
      if (meetingLine) parts.push(escapeHtml(meetingLine));
      if (where) parts.push(escapeHtml(where));
      if (o.scoutmasterEmail)
        parts.push(
          `<a href="mailto:${escapeHtml(o.scoutmasterEmail)}">${escapeHtml(o.scoutmasterEmail)}</a>`,
        );
      return `
    <section class="section cms-block cms-block--contact cms-block--contact-inline">
      <div class="wrap">
        <p class="cms-contact-inline">${parts.join(" · ")}</p>
      </div>
      ${contactStyles()}
    </section>`;
    }

    // card
    const rows = [];
    if (meetingLine) {
      rows.push(rowHtml("When", escapeHtml(meetingLine)));
    }
    if (where) {
      const w = escapeHtml(where);
      const map = mapHref
        ? ` <a class="cms-contact__map" href="${mapHref}" target="_blank" rel="noopener">map ↗</a>`
        : "";
      rows.push(rowHtml("Where", w + map));
    }
    if (o.charterOrg) {
      rows.push(rowHtml("Charter", escapeHtml(o.charterOrg)));
    }
    if (o.council || o.district) {
      const cd = [o.council, o.district].filter(Boolean).map(escapeHtml).join(" · ");
      rows.push(rowHtml("Council", cd));
    }
    if (o.scoutmasterName || o.scoutmasterEmail) {
      const name = o.scoutmasterName ? escapeHtml(o.scoutmasterName) : "";
      const email = o.scoutmasterEmail
        ? ` <a href="mailto:${escapeHtml(o.scoutmasterEmail)}">${escapeHtml(o.scoutmasterEmail)}</a>`
        : "";
      rows.push(rowHtml("Scoutmaster", `${name}${email}`));
    }
    if (o.committeeChairEmail && o.committeeChairEmail !== o.scoutmasterEmail) {
      rows.push(
        rowHtml(
          "Committee",
          `<a href="mailto:${escapeHtml(o.committeeChairEmail)}">${escapeHtml(o.committeeChairEmail)}</a>`,
        ),
      );
    }

    return `
    <section class="section cms-block cms-block--contact" id="contact">
      <div class="wrap">
        <h2>Get in touch</h2>
        <dl class="cms-contact">${rows.join("")}</dl>
      </div>
      ${contactStyles()}
    </section>`;
  },
};

function rowHtml(label, value) {
  return `
        <div class="cms-contact__row">
          <dt>${label}</dt>
          <dd>${value}</dd>
        </div>`;
}

function contactStyles() {
  return `<style>
    .cms-block--contact .wrap { max-width: 720px; }
    .cms-contact { margin: 1rem 0 0; padding: 1.5rem 1.75rem; background: var(--surface, #fff); border: 1px solid var(--line, #e5e7eb); border-radius: 12px; }
    .cms-contact__row { display: grid; grid-template-columns: 130px 1fr; padding: .55rem 0; border-top: 1px solid var(--line, #e5e7eb); gap: 1rem; }
    .cms-contact__row:first-child { border-top: 0; padding-top: 0; }
    .cms-contact__row dt { color: var(--ink-500, #6b7280); font-size: .8rem; text-transform: uppercase; letter-spacing: .05em; padding-top: .15rem; margin: 0; }
    .cms-contact__row dd { margin: 0; color: var(--ink-900, #111); }
    .cms-contact__row a { color: var(--primary, #1d6b39); text-decoration: none; }
    .cms-contact__row a:hover { text-decoration: underline; }
    .cms-contact__map { font-size: .85rem; color: var(--ink-500, #6b7280) !important; margin-left: .4rem; }
    .cms-contact-inline { color: var(--ink-700, #374151); }
    @media (max-width: 600px) {
      .cms-contact__row { grid-template-columns: 1fr; gap: 0; }
      .cms-contact__row dt { padding-top: .35rem; }
    }
  </style>`;
}
