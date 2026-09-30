"use server";

/** Insurance carriers (agencies). */

import { deleteRow } from "@/lib/server/action-helpers";

export async function deleteAgency(formData) {
  return deleteRow("agencies", formData, ["/insurance-companies"]);
}
