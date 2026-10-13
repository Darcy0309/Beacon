"use server";

/** The document library. */

import { deleteRow } from "@/lib/server/action-helpers";

export async function deleteDocument(formData) {
  return deleteRow("documents", formData, ["/documents"], { action: "document.delete", entity: "document", name: "name" });
}
