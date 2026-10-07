"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { importCarriers } from "@/features/insurance/actions";
import { parseCsv } from "@/lib/csv";
import { carrierNamesFromRows } from "@/lib/coverage";

/**
 * Import carrier names from a CSV (a column headed Carrier, Name or
 * Company, or just one name a line), so the carrier fields on lead sheets
 * suggest them. Names already on file are skipped.
 */
export default function CarrierImport() {
  const fileRef = useRef(null);
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const names = carrierNamesFromRows(parseCsv(await file.text()));
    if (!names.length) {
      toast.error("No carrier names found in that file.");
      return;
    }
    startTransition(async () => {
      const result = await importCarriers(names);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      const { added, skipped } = result.data;
      toast.success(`${added.toLocaleString()} carrier${added === 1 ? "" : "s"} added${skipped ? `, ${skipped.toLocaleString()} already on file` : ""}`);
      router.refresh();
    });
  };

  return (
    <>
      <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={onFile} data-carrier-import />
      <Button size="sm" variant="outline" disabled={pending} onClick={() => fileRef.current?.click()}>
        <Upload /> {pending ? "Importing…" : "Import carriers (CSV)"}
      </Button>
    </>
  );
}
