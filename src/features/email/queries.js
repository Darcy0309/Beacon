/** Emailing a name's contact: how an email will go out. */

import "server-only";
import { mailServer } from "@/lib/server/mail";
import { isReservedAddress } from "@/lib/email";
import { createClient } from "@/lib/supabase/server";

/**
 * What the Email dialog tells the sender before they write: the address it
 * goes out from, under their name, with replies coming back to them; or,
 * when email cannot be sent yet, what is missing ("server": no mail login in
 * the server's environment, "from": no From address in Settings).
 */
export async function getEmailSender(me) {
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", "mail").maybeSingle();
  const from = data?.value?.from ?? null;
  const missing = !mailServer() ? "server" : !from ? "from" : null;
  // A test sign-in (sean@beacon.test) reaches nobody: replies then go to the From address.
  const replyTo = me?.email && !isReservedAddress(me.email) ? me.email : from ?? "";
  return { ready: !missing, missing, from, name: me?.name ?? "", replyTo };
}
