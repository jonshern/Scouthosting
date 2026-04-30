// Typed fetch wrapper for the Compass JSON API. Adds the bearer token,
// builds URLs against the active org's host, and turns non-2xx responses
// into typed ApiError instances so callers can branch on `error.code`.

import { hostForOrg, DEFAULT_API_CONFIG, type ApiConfig } from "./config";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly extra: Record<string, unknown>;

  constructor(status: number, code: string, message?: string, extra: Record<string, unknown> = {}) {
    super(message || code);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export type ClientOptions = {
  /** The org slug whose API host we should hit. */
  orgSlug: string;
  /** The bearer token. */
  token: string;
  config?: ApiConfig;
  /** Optional fetch override for tests. */
  fetchImpl?: typeof fetch;
};

export type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
};

/**
 * Build a request against `/api/v1/<path>` and return the parsed JSON.
 * Throws ApiError on non-2xx so callers can `try/catch` rather than
 * defensively check every response.
 */
export async function apiRequest<T = unknown>(
  options: ClientOptions,
  path: string,
  reqOpts: RequestOptions = {},
): Promise<T> {
  const { orgSlug, token, config = DEFAULT_API_CONFIG, fetchImpl = fetch } = options;
  if (!orgSlug) throw new Error("apiRequest: missing orgSlug");
  if (!token) throw new ApiError(401, "missing_token");

  const url = new URL(`/api/v1${path.startsWith("/") ? "" : "/"}${path}`, hostForOrg(orgSlug, config));
  if (reqOpts.query) {
    for (const [k, v] of Object.entries(reqOpts.query)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (reqOpts.body !== undefined) headers["Content-Type"] = "application/json";

  const res = await fetchImpl(url.toString(), {
    method: reqOpts.method || "GET",
    headers,
    body: reqOpts.body !== undefined ? JSON.stringify(reqOpts.body) : undefined,
    signal: reqOpts.signal,
  });

  // Empty 204s come back without a body; preserve them.
  if (res.status === 204) return undefined as unknown as T;

  let payload: unknown = null;
  try {
    payload = await res.json();
  } catch {
    // Non-JSON body is unexpected for our API but recover gracefully.
  }

  if (!res.ok) {
    const data = (payload || {}) as Record<string, unknown>;
    const code = String(data.error || `http_${res.status}`);
    throw new ApiError(res.status, code, code, data);
  }
  return payload as T;
}
