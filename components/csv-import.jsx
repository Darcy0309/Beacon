"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UploadCloud, FileSpreadsheet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/field";
import { importLeadsCsv } from "@/lib/actions";
import { cn } from "@/lib/utils";

const EMPTY = { ok: false, data: null, error: null };

export default function CsvImport({ projects = [] }) {
  const [state, formAction, pending] = useActionState(importLeadsCsv, EMPTY);
  const [fileName, setFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);
  const formRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      const { imported, errors, total } = state.data ?? {};
      toast.success(`Imported ${imported} of ${total} rows${errors ? ` · ${errors} skipped` : ""}`);
      formRef.current?.reset();
      setFileName("");
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!/\.csv$/i.test(file.name)) {
      toast.error("Only CSV files are supported.");
      return;
    }
    // Hand the dropped file to the real input so it submits with the form.
    const dt = new DataTransfer();
    dt.items.add(file);
    if (inputRef.current) {
      inputRef.current.files = dt.files;
      setFileName(file.name);
    }
  }

  return (
    <Card>
      <CardContent className="p-5">
        <form ref={formRef} action={formAction} className="space-y-4">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => inputRef.current?.click()}
            className={cn(
              "flex cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed py-10 text-center transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
            )}
          >
            {fileName ? (
              <>
                <FileSpreadsheet className="size-8 text-primary" />
                <div>
                  <div className="font-medium">{fileName}</div>
                  <div className="text-sm text-muted-foreground">Ready to import · click to choose another</div>
                </div>
              </>
            ) : (
              <>
                <UploadCloud className="size-8 text-muted-foreground" />
                <div>
                  <div className="font-medium">Drag &amp; drop a CSV file</div>
                  <div className="text-sm text-muted-foreground">
                    or click to browse · columns like Company, Contact, Phone, City, State
                  </div>
                </div>
              </>
            )}
            <input
              ref={inputRef}
              type="file"
              name="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => setFileName(e.target.files?.[0]?.name ?? "")}
            />
          </div>

          <div className="flex flex-wrap items-end justify-end gap-2">
            <Select name="project_id" defaultValue="" className="h-9 w-auto max-w-[16rem]">
              <option value="">No project</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
            <Input name="list_source" placeholder="List source" className="h-9 w-40" />
            <Button type="submit" size="sm" disabled={pending || !fileName}>
              {pending ? "Importing…" : "Import leads"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
