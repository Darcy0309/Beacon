import { fetch as undiciFetch, Agent } from "undici";

// Every Supabase call from the server goes through this fetch.
//
// A page can fire a dozen PostgREST requests at once, and opening that many
// TLS connections in a burst is far slower than the queries themselves. A
// small keep-alive pool serialises the burst over a few warm sockets.
//
// Measured against this deployment: a warm socket answers in well under a
// second even after sitting idle, while a freshly opened connection now and
// then never answers at all. So sockets are kept for a long time, and a read
// that stalls is abandoned quickly and tried again on a new socket. Writes
// are never repeated; they get generous headroom instead.
const CONNECTIONS = 4;
const READ_TIMEOUT_MS = 4_000;
const READ_ATTEMPTS = 3;
const WRITE_TIMEOUT_MS = 30_000;

function agent() {
  // One pool per process. Kept on globalThis so dev-server module reloads do
  // not leak agents.
  return (globalThis.__lighthouseSupabaseAgent ??= new Agent({
    connections: CONNECTIONS,
    keepAliveTimeout: 60_000,
    keepAliveMaxTimeout: 60_000,
    connectTimeout: 5_000,
    headersTimeout: WRITE_TIMEOUT_MS,
    bodyTimeout: WRITE_TIMEOUT_MS,
  }));
}

const isConnectionError = (err) => {
  const code = err?.cause?.code ?? err?.code ?? "";
  return (
    /TIMEOUT|ECONNRESET|ECONNREFUSED|EPIPE|SOCKET|UND_ERR_CLOSED|UND_ERR_DESTROYED/i.test(String(code)) ||
    /fetch failed|other side closed|socket hang up/i.test(String(err?.message ?? err?.cause?.message ?? ""))
  );
};

export async function supabaseFetch(url, init = {}) {
  const method = String(init.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return undiciFetch(url, { ...init, dispatcher: agent() });
  }

  let lastError;
  for (let attempt = 1; attempt <= READ_ATTEMPTS; attempt++) {
    const timeout = AbortSignal.timeout(READ_TIMEOUT_MS);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    try {
      return await undiciFetch(url, { ...init, signal, dispatcher: agent() });
    } catch (err) {
      lastError = err;
      // The caller's own abort, or a real error from the server, ends it.
      if (init.signal?.aborted || !(timeout.aborted || isConnectionError(err))) throw err;
    }
  }
  throw lastError;
}
