/**
 * The address people reach the app at, for links in emails and for redirects.
 *
 * Behind a proxy or hosting platform the request URL the server sees is its
 * own (http://localhost:3000); the public host and scheme arrive in the
 * X-Forwarded-* headers. Takes anything with .get(name): a Headers object or
 * next/headers' headers().
 */
export function publicOrigin(headers) {
  const first = (v) => (v ?? "").split(",")[0].trim();
  const host = first(headers.get("x-forwarded-host")) || first(headers.get("host")) || "localhost:3000";
  const proto =
    first(headers.get("x-forwarded-proto")) || (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}
