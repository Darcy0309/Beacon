import { NextResponse } from "next/server";
import { getLeadConversation } from "@/features/texts/conversation";
import { getCurrentUser } from "@/lib/server/session";

export const dynamic = "force-dynamic";

/** A lead's Conversation (calls and texts), for the staff who can see the lead: the tab asks again now and then for replies. */
export async function GET(_request, { params }) {
  const { id } = await params;
  if (!(await getCurrentUser())) return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  if (!/^[1-9]\d{0,17}$/.test(id)) return NextResponse.json({ error: "No such lead" }, { status: 404 });
  try {
    const conversation = await getLeadConversation(Number(id));
    if (!conversation) return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    return NextResponse.json({ items: conversation.items }, { headers: { "cache-control": "private, no-store" } });
  } catch (err) {
    console.error("[lead conversation]", err?.message ?? err);
    return NextResponse.json({ error: "The conversation could not be read" }, { status: 500 });
  }
}
