import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * The Signature Select report's figures (Sean, Nov 2026): what was charged between `from` and `to` (each month
 * of a monthly term, each annual term on its start), for one client or all; and every client's terms, for who
 * is on it now. Administrators only (select_charges() refuses anyone else).
 */
export async function getSelectReport(from, to, companyId = null) {
  const supabase = await createClient();
  const [charges, terms] = await Promise.all([
    supabase.rpc("select_charges", { p_from: from, p_to: to, p_company: companyId }),
    supabase.from("select_terms").select("id, company_id, plan, amount, starts_on, ends_on, company:companies(name)").order("starts_on", { ascending: false }),
  ]);
  if (charges.error) throw charges.error;
  if (terms.error) throw terms.error;
  return {
    charges: (charges.data ?? []).map((c) => ({ ...c, amount: Number(c.amount) })),
    terms: (terms.data ?? []).map((t) => ({ ...t, amount: Number(t.amount), client: (Array.isArray(t.company) ? t.company[0] : t.company)?.name ?? "—" })),
  };
}

/** The clients `userId` is the Sales Rep of, each with its Signature Select terms (newest first), by name. */
export async function getRepSelectClients(userId) {
  if (!userId) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.from("companies").select("id, name, select_terms(id, plan, amount, starts_on, ends_on)")
    .eq("sales_rep_id", userId).is("deleted_at", null).order("name");
  if (error) throw error;
  return (data ?? []).map((c) => ({ id: c.id, name: c.name,
    terms: (c.select_terms ?? []).map((t) => ({ ...t, amount: Number(t.amount) })).sort((a, b) => b.starts_on.localeCompare(a.starts_on)) }));
}
