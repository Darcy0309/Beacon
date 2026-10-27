import "server-only";
import { createClient } from "@/lib/supabase/server";
import { one } from "@/lib/server/query-helpers";
import { fullName } from "@/lib/format";

/** The SIC tree's rows, sectors to codes, in their order. */
export async function getSicRows(supabase = null) {
  const db = supabase ?? (await createClient());
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("list_sic").select("code, name, kind, parent, sort").order("sort").order("code").range(from, from + 999);
    if (error) throw error;
    out.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

const REQUEST_COLUMNS = `id, company_id, sales_rep_id, source, title, prospect, criteria, notes, status, created_at, updated_at,
  company:companies(id, name), rep:users!list_requests_sales_rep_id_fkey(id, first_name, last_name),
  by:users!list_requests_created_by_fkey(first_name, last_name)`;

function shapeRequest(r) {
  const rep = one(r.rep);
  const by = one(r.by);
  return {
    id: r.id, companyId: r.company_id, client: one(r.company)?.name ?? null, salesRepId: r.sales_rep_id,
    salesRep: rep ? fullName(rep) : null, source: r.source, title: r.title, prospect: r.prospect ?? null,
    criteria: r.criteria ?? {}, notes: r.notes, status: r.status, at: r.created_at, updated: r.updated_at,
    by: by ? fullName(by) : null,
  };
}

/** Requests, newest first: every one for staff (or one client's, or one Sales Rep's), a client's own for a client. */
export async function listRequests({ companyId = null, salesRepId = null, status = null } = {}) {
  const supabase = await createClient();
  let q = supabase.from("list_requests").select(REQUEST_COLUMNS).order("created_at", { ascending: false }).limit(500);
  if (companyId) q = q.eq("company_id", companyId);
  if (salesRepId) q = q.eq("sales_rep_id", salesRepId);
  if (status) q = q.eq("status", status);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []).map(shapeRequest);
}

export async function getRequest(id) {
  const supabase = await createClient();
  const { data, error } = await supabase.from("list_requests").select(REQUEST_COLUMNS).eq("id", id).maybeSingle();
  if (error) throw error;
  return data ? shapeRequest(data) : null;
}

/** The codes a client has asked for before (each with when it was last), to show in the tree. */
export async function targetedBefore(companyId, exceptId = null) {
  if (!companyId) return {};
  const supabase = await createClient();
  let q = supabase.from("list_requests").select("id, criteria, created_at").eq("company_id", companyId).order("created_at");
  if (exceptId) q = q.neq("id", exceptId);
  const { data, error } = await q;
  if (error) throw error;
  const out = {};
  for (const r of data ?? []) for (const c of r.criteria?.sic ?? []) out[c] = r.created_at;
  return out;
}

/** The links prospects fill in a request from, newest first. */
export async function listLinks() {
  const supabase = await createClient();
  const { data, error } = await supabase.from("list_request_links")
    .select("id, token, label, active, expires_at, created_at, sales_rep:users!list_request_links_sales_rep_id_fkey(first_name, last_name), company:companies(name)")
    .order("created_at", { ascending: false }).limit(200);
  if (error) throw error;
  return (data ?? []).map((l) => ({
    id: l.id, token: l.token, label: l.label, active: l.active, expires: l.expires_at, at: l.created_at,
    salesRep: one(l.sales_rep) ? fullName(one(l.sales_rep)) : null, client: one(l.company)?.name ?? null,
  }));
}
