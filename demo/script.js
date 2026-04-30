// Tenant page behaviors. Only one for now: the footer year.
// The legacy hamburger-menu toggle was dropped — the new template's top
// bar wraps responsively in CSS instead.

const yr = document.getElementById("yr");
if (yr) yr.textContent = new Date().getFullYear();
