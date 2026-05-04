// Live block: embed a Survey form inline.
//
// Looks up Survey by slug (admin pastes the survey's slug into the
// block on the canvas — same slug that powers /surveys/:slug). Renders
// the question fields inline and POSTs to the existing
// /surveys/:slug endpoint, so the same submission flow + audit trail
// is reused. Audience-respect: members-only surveys still require
// sign-in for the public visitor; the block surfaces a sign-in
// prompt instead of the form for unauthenticated viewers.

function safeStr(v, max = 100) {
  return String(v || "").slice(0, max).trim();
}

export const surveyBlock = {
  type: "survey",
  label: "Survey form",
  description: "Embed a fillable survey by its slug.",
  defaults: { surveySlug: "" },

  normalise(input) {
    return {
      surveySlug: safeStr(input.surveySlug, 60).toLowerCase().replace(/[^a-z0-9-]/g, ""),
    };
  },

  async fetch({ orgId, config, prisma }) {
    const slug = safeStr(config.surveySlug, 60);
    if (!slug) return { survey: null, reason: "noslug" };
    const survey = await prisma.survey.findUnique({
      where: { orgId_slug: { orgId, slug } },
      select: {
        id: true,
        slug: true,
        title: true,
        description: true,
        questions: true,
        audience: true,
        closesAt: true,
      },
    });
    if (!survey) return { survey: null, reason: "notfound", slug };
    return { survey };
  },

  render({ data, escapeHtml }) {
    if (!data?.survey) {
      // Empty / missing — render an admin-friendly hint that's
      // unobtrusive on the public site (looks like a styled note,
      // not a broken form).
      const reason = data?.reason || "noslug";
      const hint =
        reason === "notfound"
          ? `No survey with slug "${escapeHtml(data?.slug || "")}" exists. Create one in /admin/surveys, or update this block's slug.`
          : `Configure this block: add the slug of an existing survey from /admin/surveys.`;
      return `
    <section class="section cms-block cms-block--survey">
      <div class="wrap">
        <p class="cms-survey-empty">${hint}</p>
      </div>
      ${surveyStyles()}
    </section>`;
    }

    const survey = data.survey;
    const closed = survey.closesAt && new Date(survey.closesAt) < new Date();
    const questions = Array.isArray(survey.questions) ? survey.questions : [];

    if (closed) {
      return `
    <section class="section cms-block cms-block--survey">
      <div class="wrap">
        <h2>${escapeHtml(survey.title)}</h2>
        ${survey.description ? `<p class="cms-survey-desc">${escapeHtml(survey.description)}</p>` : ""}
        <p class="cms-survey-closed">This survey closed on ${escapeHtml(new Date(survey.closesAt).toLocaleDateString("en-US"))}.</p>
      </div>
      ${surveyStyles()}
    </section>`;
    }

    const fieldHtml = (q) => {
      const reqd = q.required ? " required" : "";
      const id = escapeHtml(q.id);
      switch (q.type) {
        case "long":
          return `<textarea name="${id}" rows="3" maxlength="2000"${reqd}></textarea>`;
        case "yesno":
          return `<select name="${id}"${reqd}><option value="">—</option><option value="yes">Yes</option><option value="no">No</option></select>`;
        case "select":
          return `<select name="${id}"${reqd}><option value="">—</option>${(q.options || [])
            .map((o) => `<option value="${escapeHtml(o)}">${escapeHtml(o)}</option>`)
            .join("")}</select>`;
        case "multi":
          return `<div class="cms-survey-multi">${(q.options || [])
            .map(
              (o) =>
                `<label class="cms-survey-multi-opt"><input type="checkbox" name="${id}" value="${escapeHtml(o)}"> ${escapeHtml(o)}</label>`,
            )
            .join("")}</div>`;
        case "scale":
          return `<div class="cms-survey-scale">${[1, 2, 3, 4, 5]
            .map(
              (n) =>
                `<label><input type="radio" name="${id}" value="${n}"${reqd && n === 1 ? " required" : ""}> ${n}</label>`,
            )
            .join("")}</div>`;
        default:
          return `<input type="text" name="${id}" maxlength="500"${reqd}>`;
      }
    };

    const fields = questions
      .map(
        (q) => `
        <div class="cms-survey-q">
          <label class="cms-survey-q-label">
            <span>${escapeHtml(q.label)}${q.required ? ' <span class="cms-survey-required">(required)</span>' : ""}</span>
            ${fieldHtml(q)}
          </label>
        </div>`,
      )
      .join("");

    // Identity row — anyone audience needs name + email; members
    // audience expects the visitor to be signed in (the route
    // enforces). We don't have access to the user object here; the
    // route handles redirection. We render the name/email inputs
    // unconditionally and the route ignores them when the user is
    // signed in.
    const identityRow =
      survey.audience === "members"
        ? `<p class="cms-survey-note">Members-only survey — you'll be asked to sign in when you submit.</p>`
        : `<div class="cms-survey-row">
            <label>Your name<input name="name" type="text" required maxlength="80" autocomplete="name"></label>
            <label>Email<input name="email" type="email" required maxlength="120" autocomplete="email"></label>
          </div>`;

    return `
    <section class="section cms-block cms-block--survey" id="survey-${escapeHtml(survey.slug)}">
      <div class="wrap">
        <h2>${escapeHtml(survey.title)}</h2>
        ${survey.description ? `<p class="cms-survey-desc">${escapeHtml(survey.description)}</p>` : ""}
        <form method="post" action="/surveys/${escapeHtml(survey.slug)}" class="cms-survey-form">
          ${identityRow}
          ${fields}
          <button class="cms-survey-submit" type="submit">Submit response</button>
        </form>
      </div>
      ${surveyStyles()}
    </section>`;
  },
};

function surveyStyles() {
  return `<style>
    .cms-block--survey .wrap { max-width: 720px; }
    .cms-survey-desc { color: var(--ink-700, #374151); margin: 0 0 1rem; }
    .cms-survey-form { background: var(--surface, #fff); border: 1px solid var(--line, #e5e7eb); border-radius: 12px; padding: 1.5rem 1.75rem; margin-top: 1rem; }
    .cms-survey-row { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; margin-bottom: 1rem; }
    .cms-survey-q { margin-bottom: 1rem; }
    .cms-survey-q-label > span { display: block; font-weight: 500; margin-bottom: .25rem; color: var(--ink-900, #111); }
    .cms-survey-q input[type=text], .cms-survey-q input[type=email], .cms-survey-q select, .cms-survey-q textarea, .cms-survey-row input { margin-top: .3rem; padding: .55rem .7rem; border: 1px solid var(--ink-300, #c8ccd4); border-radius: 8px; font: inherit; width: 100%; box-sizing: border-box; }
    .cms-survey-required { color: var(--ink-500, #6b7280); font-weight: 400; font-size: .85em; }
    .cms-survey-multi { display: grid; gap: .3rem; margin-top: .3rem; }
    .cms-survey-multi-opt { display: flex; align-items: center; gap: .45rem; font-weight: 400; }
    .cms-survey-multi-opt input { width: auto; }
    .cms-survey-scale { display: flex; gap: 1rem; margin-top: .3rem; }
    .cms-survey-scale label { font-weight: 400; display: inline-flex; align-items: center; gap: .3rem; }
    .cms-survey-submit { background: var(--primary, #1d6b39); color: #fff; border: 0; padding: .65rem 1.4rem; border-radius: 8px; font-weight: 600; cursor: pointer; margin-top: .5rem; }
    .cms-survey-submit:hover { background: var(--primary-hover, #145228); }
    .cms-survey-note { color: var(--ink-500, #6b7280); font-style: italic; font-size: .9rem; }
    .cms-survey-closed { color: var(--ink-500, #6b7280); font-style: italic; padding: 1rem 0; }
    .cms-survey-empty { color: var(--ink-500, #6b7280); font-style: italic; padding: 1.5rem; text-align: center; background: #f9fafb; border: 1px dashed var(--line, #e5e7eb); border-radius: 8px; }
    @media (max-width: 600px) { .cms-survey-row { grid-template-columns: 1fr; } }
  </style>`;
}
