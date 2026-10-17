// The CSRF token for client-side action calls. The page passes the one it
// rendered with; on a first visit that can be empty because middleware sets
// the cookie on the same response, so fall back to reading the cookie.
export function csrfToken(fromPage: string): string {
  if (fromPage) return fromPage;
  if (typeof document === "undefined") return "";
  const m = document.cookie.match(/(?:^|;\s*)compass_csrf=([^;]+)/);
  return m ? decodeURIComponent(m[1]!) : "";
}
