const RESERVED = new Set([
  "www",
  "api",
  "admin",
  "app",
  "auth",
  "blog",
  "compass",
  "cdn",
  "dev",
  "docs",
  "help",
  "mail",
  "marketing",
  "shop",
  "static",
  "status",
  "store",
  "support",
  "test",
  "demo",
  "signup",
  "login",
  "logout",
  "billing",
  "pricing",
  "plans",
  "pitch",
  "positioning",
  "security",
]);

export function deriveSlug(unitType: string, unitNumber: string): string {
  return `${unitType.toLowerCase()}${unitNumber.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
}

export function isReservedSlug(slug: string): boolean {
  return RESERVED.has(slug.toLowerCase());
}

export function isValidSlug(slug: string): boolean {
  return /^[a-z0-9](?:[a-z0-9-]{0,40}[a-z0-9])?$/.test(slug);
}
