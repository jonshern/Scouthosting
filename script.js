// Apex page behaviors. Three things:
//   1. Footer year (every page that has <span id="yr">)
//   2. Hide the Google sign-in button if the server isn't configured for it
//   3. Login slug form — forward to <slug>.<APEX_DOMAIN>/login
//   4. Signup form — POST to /api/provision and surface result inline

// 1. Footer year
const yr = document.getElementById("yr");
if (yr) yr.textContent = new Date().getFullYear();

// 2. Auth providers — hide Continue-with-Google buttons if the server
//    isn't configured. Fail open (leave the button) on network error.
async function checkAuthProviders() {
  const buttons = document.querySelectorAll("a.btn--google");
  if (buttons.length === 0) return;
  try {
    const r = await fetch("/api/auth/providers");
    if (!r.ok) return;
    const { providers } = await r.json();
    if (!providers?.google) {
      buttons.forEach((b) => (b.style.display = "none"));
      // Hide the surrounding hint / divider too if they're now adjacent to
      // the form with nothing between.
      buttons.forEach((b) => {
        const hint = b.nextElementSibling;
        if (hint && hint.classList.contains("form-hint")) hint.style.display = "none";
        const divider = hint?.nextElementSibling || b.nextElementSibling;
        if (divider && divider.classList.contains("form-divider")) divider.style.display = "none";
      });
    }
  } catch {
    // Fail open.
  }
}
checkAuthProviders();

// 3a. Login email form — POST to /api/auth/login and follow the
//     redirect the server picks based on role + memberships.
const loginEmailForm = document.getElementById("login-email-form");
if (loginEmailForm) {
  const errBox = document.getElementById("login-email-error");
  const showError = (msg) => {
    if (!errBox) return;
    errBox.textContent = msg;
    errBox.hidden = false;
  };
  loginEmailForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (errBox) errBox.hidden = true;
    const data = Object.fromEntries(new FormData(loginEmailForm).entries());
    const submitBtn = loginEmailForm.querySelector('button[type="submit"]');
    const originalLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Signing in…";
    try {
      const csrf = await fetch("/api/csrf", { credentials: "same-origin" })
        .then((r) => r.json())
        .then((b) => b.token)
        .catch(() => "");
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRF-Token": csrf,
        },
        credentials: "same-origin",
        body: JSON.stringify(data),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok || !body.ok) {
        showError(body.error || "Sign-in failed.");
        return;
      }
      // Honor ?next= when the page was opened with one (e.g. the mobile
      // app's /auth/mobile/begin flow bounces here with
      // ?next=/auth/mobile/begin?redirect=compass://...). Restrict to
      // same-origin paths to prevent open-redirect.
      const explicitNext = new URLSearchParams(window.location.search).get("next");
      const safeNext =
        explicitNext && explicitNext.startsWith("/") && !explicitNext.startsWith("//")
          ? explicitNext
          : null;
      location.href = safeNext || body.redirect || "/";
    } catch (err) {
      showError(err.message || "Network error.");
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });
}

// 3b. "Don't know where you sign in?" — reveal the slug-finder fallback.
const showSlugLink = document.getElementById("login-show-slug");
if (showSlugLink) {
  showSlugLink.addEventListener("click", (e) => {
    e.preventDefault();
    const slugForm = document.getElementById("login-slug-form");
    const slugDivider = document.getElementById("login-slug-divider");
    if (slugForm) slugForm.hidden = false;
    if (slugDivider) slugDivider.hidden = false;
    showSlugLink.parentElement.hidden = true;
  });
}

// 3c. Login slug form — forward to the unit's subdomain.
const loginSlugForm = document.getElementById("login-slug-form");
if (loginSlugForm) {
  loginSlugForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const slug = (loginSlugForm.elements.namedItem("slug")?.value || "")
      .trim()
      .toLowerCase();
    if (!slug) return;
    // Same-host fallback for dev (localhost): use *.localhost so the
    // server's APEX_HOSTS check sees it as a tenant subdomain.
    const apex = location.hostname.endsWith("localhost")
      ? "localhost"
      : "compass.app";
    location.href = `${location.protocol}//${slug}.${apex}/login`;
  });
}

// 4. Signup form — POST JSON to /api/provision and render the result.
const signupForm = document.getElementById("signup-form");
if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const result = document.getElementById("signup-result");
    result.hidden = true;
    result.classList.remove("form-result--err");

    const data = Object.fromEntries(new FormData(signupForm).entries());
    const submitBtn = signupForm.querySelector('button[type="submit"]');
    const originalLabel = submitBtn.textContent;
    submitBtn.disabled = true;
    submitBtn.textContent = "Provisioning…";

    try {
      const res = await fetch("/api/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        throw new Error((body.errors || ["Something went wrong."]).join(" "));
      }
      result.innerHTML = `
        <strong>${body.tenant.displayName} is live.</strong><br/>
        Your site: <a href="${body.url}">${body.url}</a><br/>
        We've sent a setup email to <code>${body.tenant.scoutmasterEmail}</code>.
      `;
      result.hidden = false;
      signupForm.reset();
    } catch (err) {
      result.classList.add("form-result--err");
      result.innerHTML = `<strong>Couldn't provision your site.</strong> ${err.message}`;
      result.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = originalLabel;
    }
  });
}
