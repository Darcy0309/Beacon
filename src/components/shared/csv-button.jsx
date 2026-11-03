"use client";

import { toast } from "sonner";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

/** Export CSV: `csv` (made on the server) downloaded as `fileName`, opening in Excel with its accents intact. */
export default function CsvButton({ csv, fileName, label = "Export CSV", disabled = false, className, ...rest }) {
  const download = () => {
    try {
      const url = URL.createObjectURL(new Blob([`﻿${csv}\r\n`], { type: "text/csv;charset=utf-8" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: fileName });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      toast.error("Couldn't make the CSV. Try again.");
    }
  };
  return (
    <button type="button" onClick={download} disabled={disabled} {...rest}
      className={cn("flex items-center gap-1.5 rounded-md border border-[var(--panel-border)] px-2.5 py-1 text-[0.66rem] font-bold uppercase tracking-[0.12em] text-muted-foreground transition-colors hover:border-primary/40 hover:text-primary disabled:opacity-40", className)}>
      <Download className="size-3.5" /> {label}
    </button>
  );
}
