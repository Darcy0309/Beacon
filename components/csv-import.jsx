"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { UploadCloud } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { importLeadsCsv } from "@/lib/actions";
import { cn } from "@/lib/utils";

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };
const MAX_BYTES = 5 * 1024 * 1024;

export default function CsvImport() {
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
      // Import failures are about the file as a whole, so a toast is the right place.
      toast.error(state.error);
    }
  }, [state, router]);

  function accept(file) {
    if (!file) return false;
    if (!/\.csv$/i.test(file.name)) {
      toast.error("Only .csv files can be imported.");
      return false;
    }
    if (file.size > MAX_BYTES) {
      toast.error("That file is larger than 5 MB.");
      return false;
    }
    return true;
  }

  function onDrop(e) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (!accept(file)) return;
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
        <form ref={formRef} action={formAction}>
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            className={cn(
              "flex flex-col items-center justify-center gap-3 rounded-lg border-2 border-dashed py-10 text-center transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-border"
            )}
          >
            <UploadCloud className="size-8 text-muted-foreground" />
            <div>
              <div className="font-medium">
                {fileName || "Drag & drop a CSV file"}
              </div>
              <div className="text-sm text-muted-foreground">
                {state?.fieldErrors?.file
                  ? <span className="text-destructive">{state.fieldErrors.file}</span>
                  : fileName
                    ? "Ready to import · columns like Company, Contact, Phone, City, State"
                    : "or browse to upload · .csv up to 5 MB"}
              </div>
            </div>
            <input
              ref={inputRef}
              type="file"
              name="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f && !accept(f)) { e.target.value = ""; setFileName(""); return; }
                setFileName(f?.name ?? "");
              }}
            />
            {fileName ? (
              <Button size="sm" type="submit" disabled={pending}>
                {pending ? "Importing…" : "Import leads"}
              </Button>
            ) : (
              <Button size="sm" variant="outline" type="button" onClick={() => inputRef.current?.click()}>
                Browse files
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
