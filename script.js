// Mobile nav toggle
const toggle = document.querySelector(".nav-toggle");
const nav = document.querySelector("#nav");
if (toggle && nav) {
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  // Close menu when a link is tapped
  nav.addEventListener("click", (e) => {
    if (e.target.tagName === "A") {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    }
  });
}

// Footer year
const yr = document.getElementById("yr");
if (yr) yr.textContent = new Date().getFullYear();

// Hide the Google sign-in button if the server isn't configured for it.
async function checkAuthProviders() {
  const buttons = document.querySelectorAll("a.google-btn");
  if (buttons.length === 0) return;
  try {
    const r = await fetch("/api/auth/providers");
    if (!r.ok) return;
    const { providers } = await r.json();
    if (!providers?.google) buttons.forEach((b) => (b.style.display = "none"));
  } catch {
    // Fail open — leave the button; clicking it shows a friendly error page.
  }
}
checkAuthProviders();

// Signup form (signup.html) — POSTs to the provisioning endpoint.
const signupForm = document.getElementById("signup-form");
if (signupForm) {
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const result = document.getElementById("signup-result");
    result.hidden = true;
    result.classList.remove("err");

    const data = Object.fromEntries(new FormData(signupForm).entries());
    const submitBtn = signupForm.querySelector('button[type="submit"]');
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
        <strong>${body.tenant.displayName} is live.</strong>
        Your site: <a href="${body.url}">${body.url}</a><br/>
        We've sent a setup email to <code>${body.tenant.scoutmasterEmail}</code>.
      `;
      result.hidden = false;
      signupForm.reset();
    } catch (err) {
      result.classList.add("err");
      result.innerHTML = `<strong>Couldn't provision your site.</strong> ${err.message}`;
      result.hidden = false;
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = "Create my site";
    }
  });
}
