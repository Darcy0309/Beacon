import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY, AUTH_ID_HEADER, supabaseConfigProblem } from "@/lib/supabase/config";
import { supabaseFetch } from "@/lib/supabase/fetch";

// Open without a session: signing in, the browser's push worker (fetched again
// by the browser on its own), and push delivery, which the database calls
// with its own secret (app/api/push/deliver), and a lead sheet's private
// link, whose signed token says which lead (app/sheet/[token]).
const PUBLIC_PATHS = ["/login", "/auth", "/setup", "/sw.js", "/api/push/deliver", "/sheet"];

/**
 * True when the session has cleared two-factor. The assurance level is a
 * claim inside the access token, so this reads the cookie rather than
 * calling Supabase again.
 */
async function atFullAssurance(supabase) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) return false;
  try {
    const payload = JSON.parse(Buffer.from(token.split(".")[1], "base64").toString("utf8"));
    return payload?.aal === "aal2";
  } catch {
    // An unreadable token is not proof of anything; fail closed.
    return false;
  }
}

export async function proxy(request) {
  const { pathname } = request.nextUrl;

  // Without a database there is nothing to protect — send everything to the
  // setup screen instead of failing every request with a 500.
  const problem = supabaseConfigProblem();
  if (problem) {
    if (pathname === "/setup") return NextResponse.next({ request });
    const url = request.nextUrl.clone();
    url.pathname = "/setup";
    url.search = `?reason=${problem}`;
    return NextResponse.redirect(url);
  }

  let refreshed = [];
  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { fetch: supabaseFetch },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Update the request so the app sees the fresh token, and remember
        // the cookies for the response built below.
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        refreshed = cookiesToSet;
      },
    },
  });

  // Refreshes the session cookie when it is close to expiring. If Supabase is
  // unreachable, treat the visitor as signed out rather than crashing — the
  // login page will surface the real error on submit.
  let user = null;
  let unreachable = false;
  try {
    const { data, error } = await supabase.auth.getUser();
    user = data?.user ?? null;
    // auth-js reports a failed network call as an error rather than throwing.
    unreachable = error?.name === "AuthRetryableFetchError";
  } catch (err) {
    unreachable = true;
    console.error("[proxy] Supabase unreachable:", err?.message ?? err);
  }

  const isPublic = PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // A visitor with a session cookie whose check could not reach Supabase is
  // not signed out — let the request through so the page reports the outage
  // itself. Row Level Security still guards every query.
  if (!user && unreachable && !isPublic && request.cookies.getAll().some((c) => c.name.includes("auth-token"))) {
    console.error("[proxy] session check failed, passing request through");
    const headers = new Headers(request.headers);
    headers.delete(AUTH_ID_HEADER);
    return NextResponse.next({ request: { headers } });
  }

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  // With an authenticator enrolled, a password alone only reaches aal1. Send
  // those half-finished sessions back to the login page for the code, rather
  // than letting them browse. The factors came back with getUser(), and the
  // level is a claim inside the token it just validated, so this costs
  // nothing extra.
  const needsCode = user && (user.factors ?? []).some((f) => f.status === "verified") && !(await atFullAssurance(supabase));
  if (needsCode && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  if (user && !needsCode && (pathname === "/login" || pathname === "/setup")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    url.search = "";
    return NextResponse.redirect(url);
  }

  // Snapshot the headers after getUser() so a refreshed session cookie is
  // included, then stamp the verified user id on.
  const headers = new Headers(request.headers);
  if (user) headers.set(AUTH_ID_HEADER, user.id);
  else headers.delete(AUTH_ID_HEADER);

  const response = NextResponse.next({ request: { headers } });
  refreshed.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
  return response;
}

export const config = {
  matcher: [
    // Everything except static assets and image files.
    "/((?!_next/static|_next/image|favicon.ico|logo.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
    // And any request that arrives carrying the auth-id header itself (it must
    // be the literal AUTH_ID_HEADER: matchers are read at build time). Then the
    // proxy runs and overwrites it, even on a path the line above skips, such
    // as /anything.png, which the app would still render.
    { source: "/:path*", has: [{ type: "header", key: "x-lighthouse-auth-id" }] },
  ],
};
