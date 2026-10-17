// The address people write to for help: the billing lock message, the
// marketing footer and the sign-in page all show it. SUPPORT_EMAIL
// overrides the default once the family's domain and mailbox exist.
// Pages Next prerenders read it at build time, the rest at request time,
// so set it for both the image build and the service.
export const DEFAULT_SUPPORT_EMAIL = "hello@scoutingcompass.com";

export function supportEmail(): string {
  return process.env.SUPPORT_EMAIL?.trim() || DEFAULT_SUPPORT_EMAIL;
}
