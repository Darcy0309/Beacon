import { fetch as undiciFetch, Agent } from "undici";
import { SUPABASE_URL, isSupabaseConfigured } from "@/lib/supabase/config";

// Every Supabase call from the server goes through this fetch.
//
// A page fires several PostgREST requests at once, and opening that many TLS
// connections in a burst costs far more than the queries themselves, so they
// share a small keep-alive pool.
//
// Measured against this deployment: a warm socket answers in well under a
// second, the first call over a cold connection routinely takes four to eight,
// and once in a while a fresh socket never answers at all. Reads therefore get
// a generous first attempt and two shorter retries on new sockets — a budget
// tight enough to catch the dead socket quickly also fails every cold start,
// which is what turned the first click after opening the app into an error
// screen. Writes are never repeated; they get one long window instead.
const CONNECTIONS = 4;
const READ_BUDGETS_MS = [12_000, 10_000, 8_000];
const WRITE_TIMEOUT_MS = 30_000;
const KEEP_ALIVE_MS = 60_000;

function agent() {
  // One pool per process. Kept on globalThis so dev-server module reloads do
  // not leak agents.
  return (globalThis.__lighthouseSupabaseAgent ??= new Agent({
    connections: CONNECTIONS,
    keepAliveTimeout: KEEP_ALIVE_MS,
    keepAliveMaxTimeout: KEEP_ALIVE_MS,
    connectTimeout: 8_000,
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
  for (const budget of READ_BUDGETS_MS) {
    const timeout = AbortSignal.timeout(budget);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    try {
      return await undiciFetch(url, { ...init, signal, dispatcher: agent() });
    } catch (err) {
      lastError = err;
      // The caller's own abort, or a real answer from the server, ends it.
      if (init.signal?.aborted || !(timeout.aborted || isConnectionError(err))) throw err;
    }
  }
  throw lastError;
}

/**
 * Open a connection before anyone needs one, so the first page view of a
 * fresh server does not pay for the handshake. Silent and best-effort: a
 * failed warm-up just means the first real request opens the socket itself.
 */
export async function warmPool() {
  if (!isSupabaseConfigured) return;
  try {
    const res = await undiciFetch(`${SUPABASE_URL}/auth/v1/health`, {
      method: "GET",
      signal: AbortSignal.timeout(8_000),
      dispatcher: agent(),
    });
    await res.arrayBuffer();
  } catch {
    // Nothing to do — the pool is a cache, not a dependency.
  }
}

/**
 * Keep one socket alive through quiet spells, so a click after a few idle
 * minutes still lands on a warm connection. Stops nothing from exiting.
 */
export function startPoolHeartbeat() {
  if (globalThis.__lighthouseSupabaseHeartbeat) return;
  const timer = setInterval(warmPool, KEEP_ALIVE_MS - 15_000);
  timer.unref?.();
  globalThis.__lighthouseSupabaseHeartbeat = timer;
}
