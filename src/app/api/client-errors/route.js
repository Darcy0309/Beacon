import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/server/session";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const cut = (v, n) => (typeof v === "string" && v.trim() ? v.slice(0, n) : null);

/**
 * A page that failed in the browser says what failed (route-error.jsx, Nov 2026): kept in
 * client_errors, and in the server's log, so a failure seen on one screen can be read and fixed.
 * Signed-in people only; each field cut to size.
 */
export async function POST(request) {
  const me = await getCurrentUser().catch(() => null);
  if (!me) return new NextResponse(null, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const row = {
    user_id: me.id,
    path: cut(body.path, 500),
    message: cut(body.message, 2000),
    stack: cut(body.stack, 8000),
    digest: cut(body.digest, 100),
    component: cut(body.component, 4000),
    user_agent: cut(request.headers.get("user-agent"), 500),
  };
  console.error("[client-error]", me.email, row.path, row.message, row.stack?.split("\n").slice(0, 4).join(" | "));
  const admin = createAdminClient();
  if (admin) {
    const { error } = await admin.from("client_errors").insert(row);
    if (error) console.error("[client-error] keeping it", error.message);
  }
  return new NextResponse(null, { status: 204 });
}
