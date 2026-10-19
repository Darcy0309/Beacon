import { fetch as undiciFetch, Agent } from "undici";
import { SUPABASE_URL, isSupabaseConfigured } from "@/lib/supabase/config";

// Every Supabase call from the server goes through this fetch.
//
// A page fires several PostgREST requests at once, and opening that many TLS
// connections in a burst costs far more than the queries themselves, so they
// share a small keep-alive pool.
//
// Ten, not four (Oct 2026): a lead sheet sends about thirty queries and a
// project page about twenty-five, most of them at once, and with four
// sockets they queued four at a time, each wave a round trip. Measured with
// a 50 ms round trip to the database: the project page 0.6 s -> 0.34 s, a
// lead sheet 0.56 s -> 0.40 s, the dashboard 0.84 s -> 0.65 s. A quiet page
// still opens only the sockets it needs.
//
// Measured against this deployment: a warm socket answers in well under a
// second, the first call over a cold connection routinely takes four to eight,
// and once in a while a fresh socket never answers at all. Reads therefore get
// a generous first attempt and two shorter retries on new sockets — a budget
// tight enough to catch the dead socket quickly also fails every cold start,
// which is what turned the first click after opening the app into an error
// screen. Writes are never repeated; they get one long window instead.
const CONNECTIONS = 10;
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

// The gateway in front of Supabase answering instead of the database (bad
// gateway, unavailable, timeout, and Cloudflare's 52x). A read that gets one
// is safe to ask again; it is a passing hiccup, not an answer.
const GATEWAY_ERRORS = new Set([502, 503, 504, 520, 521, 522, 523, 524]);

// LIGHTHOUSE_QUERY_LOG=1: each call to Supabase in the server log, with its
// time, table or function, rows and size, to find what makes a page slow.
// Only the names: no filter values, so nothing anyone typed or stored.
const QUERY_LOG = process.env.LIGHTHOUSE_QUERY_LOG === "1";

function logQuery(url, method, started, res) {
  try {
    const u = new URL(url);
    const select = u.searchParams.get("select");
    const filters = [...u.searchParams.keys()].filter((k) => !["select", "order", "limit", "offset"].includes(k));
    const rows = res?.headers.get("content-range")?.split("/")[1];
    const size = res?.headers.get("content-length");
    console.log(`[db] ${String(Date.now() - started).padStart(5)}ms ${method} ${u.pathname.replace(/^\/(rest|auth)\/v1/, "")}`
      + `${select ? ` select=${select.length > 140 ? `${select.slice(0, 140)}…` : select}` : ""}`
      + `${filters.length ? ` by ${filters.join(",")}` : ""}${rows && rows !== "*" ? ` total=${rows}` : ""}${size ? ` ${size}b` : ""} ${res?.status ?? "failed"}`);
  } catch {
    // A log line is never worth a failed query.
  }
}

export async function supabaseFetch(url, init = {}) {
  if (!QUERY_LOG) return supabaseFetchUnlogged(url, init);
  const started = Date.now();
  let res;
  try {
    res = await supabaseFetchUnlogged(url, init);
    return res;
  } finally {
    logQuery(url, String(init.method ?? "GET").toUpperCase(), started, res);
  }
}

async function supabaseFetchUnlogged(url, init = {}) {
  const method = String(init.method ?? "GET").toUpperCase();
  if (method !== "GET" && method !== "HEAD") {
    return undiciFetch(url, { ...init, dispatcher: agent() });
  }

  let lastError;
  for (const [attempt, budget] of READ_BUDGETS_MS.entries()) {
    const timeout = AbortSignal.timeout(budget);
    const signal = init.signal ? AbortSignal.any([init.signal, timeout]) : timeout;
    try {
      const res = await undiciFetch(url, { ...init, signal, dispatcher: agent() });
      if (!GATEWAY_ERRORS.has(res.status) || attempt === READ_BUDGETS_MS.length - 1) return res;
      // Free the socket before asking again.
      await res.body?.cancel().catch(() => {});
      lastError = new Error(`Supabase gateway answered ${res.status}`);
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
