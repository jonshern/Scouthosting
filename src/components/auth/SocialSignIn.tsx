// "Continue with Google" / "Continue with Apple", the main way in when
// the keys are set (src/lib/auth/providers.ts). A provider without keys
// gets no button; with neither, this renders nothing and the page falls
// back to passkeys and email.

import { headers } from "next/headers";
import { enabledSocialProviders, signInHref, type SocialProviderId } from "@/lib/auth/providers";
import { TENANT_HOST_HEADER } from "@/lib/tenancy/host-header";
import { apexPublicOrigin } from "@/lib/tenancy/resolve";

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.61z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.81 5.96-2.18l-2.92-2.26c-.81.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.32A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.71A5.41 5.41 0 0 1 3.68 9c0-.59.1-1.17.29-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden>
      <path d="M14.94 13.57c-.27.62-.59 1.2-.97 1.73-.51.72-.93 1.22-1.26 1.5-.5.45-1.04.69-1.62.7-.41 0-.91-.12-1.49-.36-.58-.24-1.11-.36-1.6-.36-.51 0-1.06.12-1.65.36-.59.24-1.07.37-1.43.38-.55.02-1.1-.22-1.65-.72-.36-.31-.79-.83-1.32-1.57-.57-.79-1.04-1.71-1.41-2.76C.54 10.94.34 9.84.34 8.78c0-1.21.26-2.26.78-3.13.41-.71.96-1.27 1.65-1.68.69-.41 1.43-.62 2.23-.63.43 0 1.01.13 1.73.4.72.27 1.18.4 1.38.4.15 0 .66-.16 1.52-.47.81-.29 1.5-.41 2.07-.36 1.54.12 2.7.73 3.47 1.82-1.38.83-2.06 2-2.05 3.5.01 1.17.43 2.14 1.27 2.91.38.36.81.64 1.28.84-.1.3-.21.58-.33.86zM11.93 1.6c0 .9-.33 1.74-.99 2.52-.79.92-1.75 1.45-2.79 1.37-.01-.11-.02-.22-.02-.34 0-.86.38-1.78 1.04-2.55.33-.39.76-.71 1.27-.97.51-.25 1-.39 1.45-.42.01.13.04.26.04.39z" />
    </svg>
  );
}

const BUTTONS: Record<SocialProviderId, { label: string; icon: () => React.ReactElement; className: string }> = {
  google: {
    label: "Continue with Google",
    icon: GoogleIcon,
    className: "border border-control bg-surface text-ink hover:bg-sunk hover:text-ink",
  },
  // Apple's guidelines ask for a black (or white) button with the logo.
  apple: {
    label: "Continue with Apple",
    icon: AppleIcon,
    className: "border border-ink bg-ink text-white hover:bg-ink-2 hover:text-white",
  },
};

export async function SocialSignIn({ next, className = "" }: { next?: string | null; className?: string }) {
  const providers = enabledSocialProviders();
  if (providers.length === 0) return null;
  const tenantSlug = (await headers()).get(TENANT_HOST_HEADER);
  const apexOrigin = apexPublicOrigin();
  return (
    <div className={`grid gap-2.5 ${className}`}>
      {providers.map((p) => {
        const b = BUTTONS[p];
        const Icon = b.icon;
        return (
          <a
            key={p}
            href={signInHref(p, next, { tenantSlug, apexOrigin })}
            className={`inline-flex w-full items-center justify-center gap-3 min-h-[46px] rounded-md px-4 text-[15px] font-medium no-underline transition-colors ${b.className}`}
          >
            <Icon />
            {b.label}
          </a>
        );
      })}
    </div>
  );
}

// True when at least one Google/Apple button will show, for pages that
// lay out the "or" divider around it.
export function socialSignInAvailable(): boolean {
  return enabledSocialProviders().length > 0;
}
