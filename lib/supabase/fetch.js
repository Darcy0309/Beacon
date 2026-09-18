import { fetch as undiciFetch, Agent } from "undici";

// Every Supabase call from the server goes through this fetch.
//
// A page can fire a dozen PostgREST requests at once, and opening that many
// TLS connections in a burst is far slower than the queries themselves. A
// small keep-alive pool serialises the burst over a few warm sockets, and the
// short timeouts turn a stalled socket into a quick retry instead of a page
// that hangs for minutes.
const CONNECTIONS = 4;
// A query normally answers in well under a second; a 500-row import chunk in
// a few. Anything past this is a dead socket, not a slow query.
const TIMEOUT_MS = 15_000;

function agent() {
  // One pool per process. Kept on globalThis so dev-server module reloads do
  // not leak agents.
  return (globalThis.__beaconSupabaseAgent ??= new Agent({
    connections: CONNECTIONS,
    keepAliveTimeout: 15_000,
    keepAliveMaxTimeout: 15_000,
    connectTimeout: 5_000,
    headersTimeout: TIMEOUT_MS,
    bodyTimeout: TIMEOUT_MS,
  }));
}

const isRetryable = (err) => {
  const code = err?.cause?.code ?? err?.code ?? "";
  return (
    err?.name === "TimeoutError" ||
    /TIMEOUT|ECONNRESET|ECONNREFUSED|EPIPE|SOCKET|UND_ERR_CLOSED|UND_ERR_DESTROYED/i.test(String(code)) ||
    /fetch failed|other side closed|socket hang up/i.test(String(err?.message ?? err?.cause?.message ?? ""))
  );
};

export async function supabaseFetch(url, init = {}) {
  const method = String(init.method ?? "GET").toUpperCase();
  const idempotent = method === "GET" || method === "HEAD";

  try {
    return await undiciFetch(url, { ...init, dispatcher: agent() });
  } catch (err) {
    // Reads are safe to try again on a fresh socket; writes are not.
    if (!idempotent || !isRetryable(err)) throw err;
    return undiciFetch(url, { ...init, dispatcher: agent() });
  }
}
