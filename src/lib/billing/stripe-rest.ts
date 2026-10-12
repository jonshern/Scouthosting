// Minimal Stripe REST client for platform billing. Compass only needs
// four calls (Checkout, the customer portal, subscription update), so
// it talks to the HTTPS API with fetch instead of pulling in the SDK.
// Stripe takes form-encoded bodies with bracketed keys for nested
// values (`line_items[0][price]=...`), which `encodeStripeForm` builds.

const API_BASE = "https://api.stripe.com/v1";
const API_VERSION = "2024-11-20.acacia";

type Params = Record<string, unknown>;

export function encodeStripeForm(params: Params): string {
  const out = new URLSearchParams();
  const add = (key: string, value: unknown) => {
    if (value === undefined || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((v, i) => add(`${key}[${i}]`, v));
    } else if (typeof value === "object" && !(value instanceof Date)) {
      for (const [k, v] of Object.entries(value as Params)) add(`${key}[${k}]`, v);
    } else if (value instanceof Date) {
      out.append(key, String(Math.floor(value.getTime() / 1000)));
    } else {
      out.append(key, String(value));
    }
  };
  for (const [k, v] of Object.entries(params)) add(k, v);
  return out.toString();
}

export class StripeApiError extends Error {
  constructor(
    public status: number,
    public code: string | null,
    message: string,
  ) {
    super(message);
    this.name = "StripeApiError";
  }
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export function createStripeRestClient(secretKey: string, fetchImpl: FetchLike = fetch) {
  async function call<T>(path: string, params: Params, idempotencyKey?: string): Promise<T> {
    const headers: Record<string, string> = {
      authorization: `Bearer ${secretKey}`,
      "content-type": "application/x-www-form-urlencoded",
      "stripe-version": API_VERSION,
    };
    if (idempotencyKey) headers["idempotency-key"] = idempotencyKey;
    const res = await fetchImpl(`${API_BASE}${path}`, {
      method: "POST",
      headers,
      body: encodeStripeForm(params),
    });
    const body = (await res.json().catch(() => ({}))) as {
      error?: { code?: string; message?: string };
    } & T;
    if (!res.ok) {
      throw new StripeApiError(
        res.status,
        body.error?.code ?? null,
        body.error?.message ?? `Stripe request failed (${res.status}).`,
      );
    }
    return body;
  }

  return {
    checkout: {
      sessions: {
        create: (args: unknown) =>
          call<{ id: string; url: string | null }>("/checkout/sessions", args as Params),
      },
    },
    billingPortal: {
      sessions: {
        create: (args: unknown) =>
          call<{ url: string }>("/billing_portal/sessions", args as Params),
      },
    },
    subscriptions: {
      update: (id: string, args: unknown) =>
        call<unknown>(`/subscriptions/${encodeURIComponent(id)}`, args as Params),
    },
  };
}
