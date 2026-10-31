"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, Hash, Upload, Wand2 } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { fillLeadSicCodes, importSicCodes } from "@/features/sic/actions";
import { parseCsv } from "@/lib/csv";
import { sicPairsFromRows } from "@/lib/sic";
import { reach } from "@/lib/reach";

/**
 * The SIC master list: how many codes it holds, a CSV to load (SIC Code and
 * SIC Description columns; new codes are added, a code on file takes the
 * file's description; or, ticked, the list replaced by the file), and the
 * list as it stands to download. Lead imports
 * fill in a missing code from its description, and the other way round,
 * from this list; the leads already in Lighthouse with a description and no
 * code can be given theirs at once (Oct 2026). A code's description is read
 * from the list wherever it shows, so a lead with a code needs nothing.
 */
export default function SicCodesCard({ count }) {
  const fileRef = useRef(null);
  const router = useRouter();
  const [pending, start] = useTransition();
  const [replace, setReplace] = useState(false);
  const [filling, startFilling] = useTransition();
  const fill = () => startFilling(async () => {
    const result = await reach(() => fillLeadSicCodes());
    if (!result.ok) return void toast.error(result.error);
    const { looked, filled } = result.data;
    toast.success(looked ? `${filled.toLocaleString()} of ${looked.toLocaleString()} lead${looked === 1 ? "" : "s"} with no SIC code given theirs from the description`
      : "Every lead with a description has its SIC code already",
      looked > filled ? { description: `${(looked - filled).toLocaleString()} have a description that is not one industry on the list: give those a code by hand.`, duration: 12000 } : undefined);
    router.refresh();
  });

  // One file or several at once (Oct 2026: the 2-, 4- and 6-digit tabs of the client's sheet), read as one list.
  const onFile = async (e) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = "";
    if (!files.length) return;
    let pairs;
    try {
      const seen = new Set();
      pairs = (await Promise.all(files.map(async (f) => sicPairsFromRows(parseCsv(await f.text())))))
        .flat()
        .filter((p) => !seen.has(p.code) && seen.add(p.code));
    } catch {
      toast.error(`${files.length === 1 ? "That file" : "One of those files"} couldn't be read. Save it from Excel as CSV and try again.`);
      return;
    }
    if (!pairs.length) {
      toast.error("No SIC codes found in that file: it needs a SIC Code column (and SIC Description).");
      return;
    }
    start(async () => {
      const result = await reach(() => importSicCodes(pairs, { replace }));
      if (!result.ok) return void toast.error(result.error);
      const { added, updated, removed, kept } = result.data;
      toast.success(`${added.toLocaleString()} SIC code${added === 1 ? "" : "s"} added${updated ? `, ${updated.toLocaleString()} description${updated === 1 ? "" : "s"} updated` : ""}${replace ? `, ${removed.toLocaleString()} not in the file removed` : ""}`,
        kept ? { description: `${kept.toLocaleString()} not in the file stay: clients are filed under them.` } : undefined);
      setReplace(false);
      router.refresh();
    });
  };

  return (
    <Card data-sic-codes>
      <SectionHeader label="SIC Codes" icon={Hash} />
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <p className="max-w-xl text-sm text-muted-foreground">
          <strong className="text-foreground tabular-nums" data-sic-count>{count.toLocaleString()}</strong> codes with their descriptions.
          Load your master list (a CSV with SIC Code and SIC Description columns): new codes are added and descriptions updated,
          or tick Replace to make the list the file. Choose several files at once (the 2-, 4- and 6-digit lists) to load them as one list.
          A code missing its leading zero (Excel drops it) gets it back: 111 is 0111; 4225-05 and 422505 are one code.
          Imports use it to fill in a missing code or description, and each lead&apos;s description is read from it wherever its code shows.
        </p>
        <div className="flex flex-wrap gap-2">
          <a href="/api/sic-codes" download className="inline-flex h-8 items-center gap-1.5 rounded-md border px-3 text-sm font-medium transition-colors hover:bg-muted" data-sic-download>
            <Download className="size-4" /> Download list
          </a>
          <label className="inline-flex h-8 cursor-pointer items-center gap-2 text-sm text-muted-foreground" title="Codes not in the file are removed (except those a client is filed under)">
            <input type="checkbox" checked={replace} onChange={(e) => setReplace(e.target.checked)} className="size-4 accent-[var(--primary)]" data-sic-replace />
            Replace the whole list
          </label>
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" multiple className="hidden" onChange={onFile} data-sic-import />
          <Button size="sm" variant="outline" disabled={pending} onClick={() => fileRef.current?.click()}>
            <Upload /> {pending ? "Loading…" : replace ? "Replace SIC list (CSV)" : "Load SIC list (CSV)"}
          </Button>
          {/* The leads already in, with what the business does and no code: theirs from this list, as an import would. */}
          <Button size="sm" variant="outline" disabled={filling} onClick={fill} title="Leads with a description and no SIC code get the code their description is on this list" data-sic-fill-leads>
            <Wand2 /> {filling ? "Filling in…" : "Fill in leads' missing codes"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
