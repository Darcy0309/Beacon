/**
 * The campaign-type filter on the dashboard and reports (Sean, Nov 2026, Campaign Types phase 4: "dashboards/reports
 * get a campaign-type filter, default Insurance, so IT stats stay separate"). ?ct= : a campaign type's id, "all", or
 * none (Insurance: the clients without one). Only once there are campaign types: before, nothing is filtered.
 */

import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

/**
 * The campaign type chosen on a page: { value (sent to the database: "insurance", an id, or "all"), param (?ct= as
 * it stands: "" for Insurance), options (to choose from) }, or null with no campaign types (every client, as before).
 */
export const readCampaign = cache(async (ct) => {
  // Quietly none before the migrations that add them and the filter (20270301, 20270307): every client, as before.
  const supabase = await createClient();
  const [{ data: types, error }, ready] = await Promise.all([
    supabase.from("campaign_types").select("id, name").order("name"),
    supabase.rpc("campaign_companies"),
  ]);
  if (error || ready.error || !types?.length) return null;
  const param = typeof ct === "string" && (ct === "all" || types.some((t) => String(t.id) === ct)) ? ct : "";
  return {
    value: param || "insurance",
    param,
    options: [...types.map((t) => ({ value: String(t.id), label: t.name })), { value: "all", label: "All campaign types" }],
  };
});

/** A query (an rpc) told the campaign type chosen: the database counts only its clients' projects (campaign_companies()). */
export const withCampaign = (query, campaign) => (campaign?.value && campaign.value !== "all" ? query.setHeader("x-campaign-type", campaign.value) : query);

/**
 * The clients of the campaign type chosen, for figures filtered here rather than in the database: a Set of client
 * ids, or null for every client (none chosen, or All).
 */
export const campaignCompanies = cache(async (value) => {
  if (!value || value === "all") return null;
  const supabase = await createClient();
  let q = supabase.from("companies").select("id");
  q = value === "insurance" ? q.is("campaign_type_id", null) : q.eq("campaign_type_id", Number(value));
  const { data, error } = await q;
  if (error) return null;
  return new Set((data ?? []).map((c) => c.id));
});

/** The projects of those clients: an array of project ids, or null for every project. */
export const campaignProjects = cache(async (value) => {
  const companies = await campaignCompanies(value);
  if (!companies) return null;
  const supabase = await createClient();
  const { data, error } = await supabase.from("projects").select("id, company_id");
  if (error) return null;
  // Insurance includes a project without a client.
  return (data ?? []).filter((p) => (p.company_id == null ? value === "insurance" : companies.has(p.company_id))).map((p) => p.id);
});
