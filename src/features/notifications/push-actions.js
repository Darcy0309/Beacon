"use server";

/** Push notifications: what a browser needs to subscribe. */

import { pushServer } from "@/lib/server/push";

/** The server's public push key, or null while push is not set up. */
export async function pushPublicKey() {
  return pushServer()?.publicKey ?? null;
}
