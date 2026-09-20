import { createServerClient } from "@supabase/ssr";
import { NextResponse } from "next/server";
import { SUPABASE_URL, SUPABASE_ANON_KEY, AUTH_ID_HEADER, supabaseConfigProblem } from "@/lib/supabase/config";
import { supabaseFetch } from "@/lib/supabase/fetch";

const PUBLIC_PATHS = ["/login", "/auth", "/setup"];

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

  if (user && (pathname === "/login" || pathname === "/setup")) {
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
  ],
};
