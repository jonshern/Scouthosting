// Ports the browser tests use. E2E_PORT is the main test server and
// E2E_MFA_PORT the second one with production sign-in rules
// (mfa-required.spec.ts). Override both to run the suite on a machine
// that already serves Compass on 3000/3001, such as the host Mac's
// blue-green slots (docs/runbooks-mac.md).
export const E2E_PORT = process.env.E2E_PORT || "3000";
export const E2E_MFA_PORT = process.env.E2E_MFA_PORT || "3001";
