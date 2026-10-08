/**
 * The pay period schedule, against the database as real signed-in users: an
 * administrator plans the periods; account managers and agents read them
 * (Pay & Hours shows them the schedule) but cannot change them; a client
 * sees none; and two periods can never overlap.
 *
 * Uses periods in 2033, far from any real ones, and removes them.
 *
 *   npm run test:integration
 */
import { check, finish, section } from "../support/assert.mjs";
import { signIn } from "../support/auth.mjs";
import { sql } from "../support/db.mjs";

const admin = await signIn("admin@beacon.test");
const manager = await signIn("sean@beacon.test");
const agent = await signIn("agent@beacon.test");
const client = await signIn("client@beacon.test");

try {
  section("An administrator plans the periods");
  const first = await admin.sb.from("pay_periods").insert({
    starts_on: "2033-09-30", ends_on: "2033-10-13", pay_date: "2033-10-15",
    optional_dates: ["2033-10-10"], optional_label: "Columbus Day",
  }).select("id").single();
  check("adds one, with its pay date and an optional day", !first.error && Boolean(first.data?.id), first.error?.message);
  const second = await admin.sb.from("pay_periods").insert({ starts_on: "2033-10-14", ends_on: "2033-10-28", pay_date: "2033-10-30" }).select("id").single();
  check("…and the next", !second.error, second.error?.message);
  const overlap = await admin.sb.from("pay_periods").insert({ starts_on: "2033-10-28", ends_on: "2033-11-10" }).select("id");
  check("two periods can never overlap", overlap.error?.code === "23P01", overlap.error?.message);
  const reversed = await admin.sb.from("pay_periods").insert({ starts_on: "2033-12-10", ends_on: "2033-12-01" }).select("id");
  check("…nor end before they start", Boolean(reversed.error), reversed.error?.message);

  section("Managers and agents read them, and only that");
  const read = await manager.sb.from("pay_periods").select("starts_on, pay_date").gte("starts_on", "2033-01-01").order("starts_on");
  check("an account manager sees the schedule", !read.error && read.data?.length === 2 && read.data[0].pay_date === "2033-10-15", JSON.stringify(read));
  const agentRead = await agent.sb.from("pay_periods").select("id").gte("starts_on", "2033-01-01");
  check("…so does an agent", !agentRead.error && agentRead.data?.length === 2);
  const managerAdd = await manager.sb.from("pay_periods").insert({ starts_on: "2033-11-01", ends_on: "2033-11-14" }).select("id");
  check("a manager cannot add one", Boolean(managerAdd.error) || !managerAdd.data?.length, JSON.stringify(managerAdd.data));
  const managerEdit = await manager.sb.from("pay_periods").update({ pay_date: "2033-12-25" }).eq("id", first.data.id).select("id");
  check("…nor change one", (managerEdit.data ?? []).length === 0 && sql(`select pay_date from public.pay_periods where id = ${first.data.id}`) === "2033-10-15");
  const managerDelete = await manager.sb.from("pay_periods").delete().eq("id", first.data.id).select("id");
  check("…nor remove one", (managerDelete.data ?? []).length === 0 && sql(`select count(*) from public.pay_periods where id = ${first.data.id}`) === "1");
  const clientRead = await client.sb.from("pay_periods").select("id").gte("starts_on", "2033-01-01");
  check("a client sees none", !clientRead.error && clientRead.data.length === 0, JSON.stringify(clientRead));
} finally {
  sql("delete from public.pay_periods where starts_on >= '2033-01-01' and starts_on < '2034-01-01'");
}

finish("pay periods");
