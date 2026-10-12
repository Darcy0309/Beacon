"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Hash, Upload } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { importSicCodes } from "@/features/sic/actions";
import { parseCsv } from "@/lib/csv";
import { sicPairsFromRows } from "@/lib/sic";

/**
 * The SIC master list: how many codes it holds, a CSV to load (SIC Code and
 * SIC Description columns; new codes are added, a code on file takes the
 * file's description), and the list as it stands to download. Lead imports
 * fill in a missing code from its description, and the other way round,
 * from this list.
 */
export default function SicCodesCard({ count }) {
  const fileRef = useRef(null);
  const router = useRouter();
  const [pending, start] = useTransition();

  const onFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const pairs = sicPairsFromRows(parseCsv(await file.text()));
    if (!pairs.length) {
      toast.error("No SIC codes found in that file: it needs a SIC Code column (and SIC Description).");
      return;
    }
    start(async () => {
      const result = await importSicCodes(pairs);
      if (!result.ok) return void toast.error(result.error);
      const { added, updated } = result.data;
      toast.success(`${added.toLocaleString()} SIC code${added === 1 ? "" : "s"} added${updated ? `, ${updated.toLocaleString()} description${updated === 1 ? "" : "s"} updated` : ""}`);
      router.refresh();
    });
  };

  return (
    <Card data-sic-codes>
      <SectionHeader label="SIC Codes" icon={Hash} />
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="max-w-xl text-sm text-muted-foreground">
          <strong className="text-foreground tabular-nums" data-sic-count>{count.toLocaleString()}</strong> codes with their descriptions.
          Load your master list (a CSV with SIC Code and SIC Description columns): new codes are added and descriptions updated.
          Imports use it to fill in a missing code or description.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/sic-codes" download className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors hover:bg-muted" data-sic-download>
            <Download className="size-4" /> Download list
          </a>
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={onFile} data-sic-import />
          <Button size="sm" variant="outline" disabled={pending} onClick={() => fileRef.current?.click()}>
            <Upload /> {pending ? "Loading…" : "Load SIC list (CSV)"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
