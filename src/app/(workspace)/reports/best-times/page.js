import { redirect } from "next/navigation";

/** Best Times to Call is now the Production Heat Map (Sean, Nov 2026): its old address goes there, filters and all. */
export default async function BestTimesMoved({ searchParams }) {
  const sp = await searchParams;
  const q = new URLSearchParams(Object.entries(sp ?? {}).filter(([, v]) => typeof v === "string"));
  redirect(`/reports/heat-map${q.size ? `?${q}` : ""}`);
}
