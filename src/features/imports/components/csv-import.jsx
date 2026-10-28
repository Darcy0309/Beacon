"use client";

import { startTransition, useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, Copy, Download, Layers, Loader2, UploadCloud, UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Field, Select } from "@/components/ui/field";
import ToneBadge from "@/components/shared/tone-badge";
import { importChecks, importLeadsCsv } from "@/features/imports/actions";
import { cn } from "@/lib/utils";
import { reach } from "@/lib/reach";
import { MAX_IMPORT_MB, MAX_SOURCE_MB, TEMPLATE_HEADERS, csvText, keepColumns, parseCsv, rowsToImport } from "@/lib/csv";
import { findDuplicates, removalMatcher, reasonLabel } from "@/lib/dedupe";

// The template: every column the import reads, as a CSV of headings only.
const TEMPLATE_HREF = `data:text/csv;charset=utf-8,${encodeURIComponent(`${TEMPLATE_HEADERS.join(",")}\r\n`)}`;

const EMPTY = { ok: false, data: null, error: null, fieldErrors: null, values: null };
const MAX_BYTES = MAX_SOURCE_MB * 1024 * 1024;
const MAX_UPLOAD = MAX_IMPORT_MB * 1024 * 1024;
const WHY = { ein: "same FEIN", phone: "same phone", name: "same name", contact: "same contact" };

/**
 * The import, made to always answer. An upload the server never returns a
 * result for (refused by the host, or cut off by a timeout on a long list)
 * throws instead, and a throw goes to the error screen, which reloads the
 * page: the form empties and nothing is said, as happened with the
 * Capital-Maricopa list.
 */
async function runImport(prevState, formData) {
  try {
    return await importLeadsCsv(prevState, formData);
  } catch (e) {
    console.error("[import]", e);
    return {
      ...EMPTY,
      error: "The import did not finish: the server stopped answering. Some names may already be on the project, so check its leads before importing this file again.",
      values: { project_id: formData.get("project_id"), list_source: formData.get("list_source") },
    };
  }
}

/**
 * A chosen file checked against itself and the project's client (Oct 2026):
 * its rows, the groups of records of one business (the one to keep marked),
 * and the names the client has taken off before.
 */
async function checkFile(file, projectId) {
  const csvRows = parseCsv(await file.text());
  const { rows } = rowsToImport(csvRows);
  const checks = projectId ? await reach(() => importChecks(projectId)) : { ok: true, data: { removals: [], existing: [] } };
  if (!checks.ok) throw new Error(checks.error);
  const removed = removalMatcher(checks.data.removals);
  // Already on the project, its appointment project or their other lead projects: the record there is kept.
  const there = removalMatcher(checks.data.existing);
  const removedRows = [];
  const existingRows = [];
  const open = [];
  rows.forEach((r, i) => {
    const entry = removed(r.lead);
    const have = entry ? null : there(r.lead);
    if (entry) removedRows.push({ i, entry });
    else if (have) existingRows.push({ i, entry: have });
    else open.push(i);
  });
  // Duplicates among the rest: a name left out above is not the one a group keeps.
  const groups = findDuplicates(open.map((i) => rows[i])).map((g) => ({
    rows: g.rows.map((k) => open[k]),
    keep: open[g.keep],
    why: g.why,
  }));
  return { csvRows, rows, groups, removedRows, existingRows, client: checks.data.client ?? null };
}

/** The rows of a group not kept: left off the list. */
const droppedOf = (plan, keep) => plan.groups.flatMap((g) => g.rows.filter((i) => !keep.has(i)));

/**
 * Import a lead list into a project. The names land on that project's call
 * lists, shared evenly across its account managers; each row's call-result
 * columns (old or new names) decide where in the lifecycle it starts.
 *
 * Before it goes (Oct 2026): records of one business are found and one kept
 * (the FEIN, the most contacts, the most filled in), the rest left off and
 * remembered as Deletions for the client; names the client took off before
 * are left out. Import goes ahead on that, or Review duplicates shows each
 * group to choose what to keep.
 */
export default function CsvImport({ projects = [] }) {
  const [state, formAction, pending] = useActionState(runImport, EMPTY);
  const [fileName, setFileName] = useState("");
  const [projectId, setProjectId] = useState(state?.values?.project_id ?? "");
  const [dragging, setDragging] = useState(false);
  const [plan, setPlan] = useState(null);
  const [checkError, setCheckError] = useState(null);
  const [keep, setKeep] = useState(() => new Set());
  const [reviewing, setReviewing] = useState(false);
  const [showRemoved, setShowRemoved] = useState(false);
  const [showExisting, setShowExisting] = useState(false);
  const checking = useRef(null);
  const inputRef = useRef(null);
  const formRef = useRef(null);
  const router = useRouter();

  // The file checked again whenever it or the project changes; a submit waits for it.
  const recheck = (file, project) => {
    setPlan(null);
    setCheckError(null);
    setReviewing(false);
    if (!file) {
      checking.current = null;
      return;
    }
    const run = checkFile(file, project).then(
      (p) => {
        if (checking.current !== run) return null;
        setPlan(p);
        setKeep(new Set(p.rows.map((_, i) => i).filter((i) => !p.groups.some((g) => g.rows.includes(i) && g.keep !== i))));
        return p;
      },
      (e) => {
        if (checking.current === run) setCheckError(e.message || "The file couldn't be checked.");
        return null;
      },
    );
    checking.current = run;
  };

  useEffect(() => {
    if (state?.ok) {
      const { imported, errors, total, assigned, unknown = [], duplicates = 0, removed = 0, existing = 0 } = state.data ?? {};
      const left = [duplicates ? `${duplicates} duplicate${duplicates === 1 ? "" : "s"} left off` : "", removed ? `${removed} taken off before` : "",
        existing ? `${existing} already on the project` : ""].filter(Boolean).join(" · ");
      toast.success(`Imported ${imported} of ${total} rows${errors ? ` · ${errors} skipped` : ""}${left ? ` · ${left}` : ""}${assigned ? ` · shared across ${assigned} account managers` : ""}`);
      // Old call results not recognised: those names start at the project's first result.
      if (unknown.length) {
        const n = unknown.reduce((sum, u) => sum + u.n, 0);
        toast.warning(`${n} row${n === 1 ? "" : "s"} had a call result the system doesn't recognise, so ${n === 1 ? "it starts as a new name" : "they start as new names"}`, {
          description: unknown.slice(0, 6).map((u) => `“${u.text}” (${u.n})`).join(", ") + (unknown.length > 6 ? ", …" : ""),
          duration: 20000,
        });
      }
      formRef.current?.reset();
      setFileName("");
      setProjectId(formRef.current?.elements?.project_id?.value ?? "");
      recheck(null);
      router.refresh();
    } else if (state?.error && !state?.fieldErrors?.project_id) {
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
      toast.error(`That file is larger than ${MAX_SOURCE_MB} MB.`);
      return false;
    }
    return true;
  }

  function choose(file) {
    setFileName(file?.name ?? "");
    recheck(file ?? null, projectId);
  }

  // Submitted by hand rather than through action={…}: React empties a form
  // after its action, which on a failed import dropped the chosen file while
  // the box still named it. A successful import resets the form above.
  // What goes is the file as checked: the rows kept and the columns read.
  async function onSubmit(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const file = form.get("file");
    if (!form.get("project_id")) {
      toast.error("Choose the project these names go into.");
      return;
    }
    if (!file || typeof file === "string" || !file.size) {
      toast.error("Choose a CSV file to import.");
      return;
    }
    const p = plan ?? (await checking.current);
    if (!p) {
      toast.error(checkError ?? "The file couldn't be checked. Choose it again.");
      return;
    }
    const dropped = droppedOf(p, keep);
    const text = csvText(keepColumns(p.csvRows, new Set(dropped.map((i) => p.rows[i].row))));
    const upload = new File([text], file.name, { type: "text/csv" });
    if (upload.size > MAX_UPLOAD) {
      toast.error(`The columns this list imports come to more than ${MAX_IMPORT_MB} MB: split it into smaller lists.`);
      return;
    }
    form.set("file", upload);
    form.set("duplicates", String(dropped.length));
    form.set("dropped", JSON.stringify(dropped.map((i) => {
      const l = p.rows[i].lead;
      return { company_name: l.company_name, contact_name: l.contact_name, phone: l.phone, ein: l.ein, address: l.address, city: l.city, state: l.state, zip: l.zip };
    })));
    startTransition(() => formAction(form));
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
      choose(file);
    }
  }

  const toggle = (group, i) => setKeep((s) => {
    const n = new Set(s);
    if (n.has(i)) {
      // A group keeps at least one: leaving them all off is never what is meant.
      if (group.rows.filter((k) => n.has(k)).length > 1) n.delete(i);
    } else n.add(i);
    return n;
  });
  const keepAll = (group, on) => setKeep((s) => {
    const n = new Set(s);
    for (const i of group.rows) {
      if (on || i === group.keep) n.add(i);
      else n.delete(i);
    }
    return n;
  });

  const dropped = plan ? droppedOf(plan, keep) : [];
  const toImport = plan ? plan.rows.length - dropped.length - plan.removedRows.length - plan.existingRows.length : 0;

  return (
    <Card>
      <CardContent className="p-5">
        {/* How a file is read: by its headings, in any order and in common spellings; the template has them all. */}
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--panel-border)] bg-muted/30 px-3 py-2 text-xs text-muted-foreground" data-import-help>
          <span>
            Columns are read by their headings, in any order (“Company”, “Company Name” and “COMPANY” all work), and a SalesGenie export as it comes.
            Only Company is required; columns not used are left blank.
          </span>
          <a href={TEMPLATE_HREF} download="lighthouse-import-template.csv" data-import-template
            className="inline-flex shrink-0 items-center gap-1 font-semibold text-primary hover:underline">
            <Download className="size-3.5" /> Download template
          </a>
        </div>
        <form ref={formRef} onSubmit={onSubmit} noValidate className="space-y-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Project" required error={state?.fieldErrors?.project_id}>
              <Select name="project_id" required defaultValue={state?.values?.project_id ?? ""} aria-invalid={state?.fieldErrors?.project_id ? true : undefined}
                onChange={(e) => {
                  setProjectId(e.target.value);
                  recheck(inputRef.current?.files?.[0] ?? null, e.target.value);
                }}>
                <option value="" disabled>Choose the project these names go into…</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}{p.type ? ` (${p.type === "DBDV" ? "DBDev" : "Appt"})` : ""}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="List source" hint="Where the list came from, e.g. SalesGenie Oct">
              <Input name="list_source" maxLength={80} defaultValue={state?.values?.list_source ?? ""} />
            </Field>
          </div>
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
                    : `or browse to upload · .csv up to ${MAX_SOURCE_MB} MB`}
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
                if (f && !accept(f)) { e.target.value = ""; choose(null); return; }
                choose(f ?? null);
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

          {fileName ? (
            <div className="space-y-2 text-sm" data-import-check>
              {checkError ? <p className="text-destructive">{checkError}</p> : null}
              {!plan && !checkError ? (
                <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="size-4 animate-spin" /> Checking the list for duplicates…</p>
              ) : null}
              {plan ? (
                <>
                  <p data-import-summary>
                    <span className="font-semibold tabular-nums">{toImport.toLocaleString()}</span> of {plan.rows.length.toLocaleString()} rows will be imported
                    {projectId ? null : <span className="text-muted-foreground"> · choose the project to check against the client&apos;s removed names</span>}
                  </p>
                  {plan.groups.length ? (
                    <div className="rounded-lg border border-[var(--panel-border)]">
                      <button type="button" onClick={() => setReviewing((v) => !v)} data-review-duplicates
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40">
                        {reviewing ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        <Copy className="size-4 text-amber-500" />
                        <span>
                          <span className="font-semibold tabular-nums" data-duplicate-count>{dropped.length.toLocaleString()}</span> duplicate{dropped.length === 1 ? "" : "s"} in {plan.groups.length.toLocaleString()} group{plan.groups.length === 1 ? "" : "s"} left off
                          <span className="text-muted-foreground"> · kept: the record with the FEIN, then the most contacts, then the most filled in. Left-off records are saved as Deletions for this client.</span>
                        </span>
                        <span className="ml-auto shrink-0 font-semibold text-primary">{reviewing ? "Hide" : "Review duplicates"}</span>
                      </button>
                      {reviewing ? (
                        <div className="max-h-[32rem] space-y-3 overflow-y-auto border-t border-[var(--panel-border)] p-3">
                          {plan.groups.map((g, gi) => {
                            const all = g.rows.every((i) => keep.has(i));
                            return (
                              <div key={gi} className="rounded-md border border-[var(--panel-border)]" data-duplicate-group>
                                <div className="flex items-center gap-2 border-b border-[var(--panel-border)] bg-muted/30 px-3 py-1.5 text-xs text-muted-foreground">
                                  <span>{g.why.map((w) => WHY[w]).join(" · ")}</span>
                                  <button type="button" onClick={() => keepAll(g, !all)} className="ml-auto font-semibold text-primary hover:underline" data-keep-all>
                                    {all ? "Keep just one" : "Keep all (separate locations)"}
                                  </button>
                                </div>
                                {g.rows.map((i) => {
                                  const { lead, contacts } = plan.rows[i];
                                  const kept = keep.has(i);
                                  return (
                                    <label key={i} className={cn("flex cursor-pointer items-start gap-3 px-3 py-2 text-xs", kept ? "" : "opacity-60")}>
                                      <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" checked={kept} onChange={() => toggle(g, i)} data-keep-row={i} />
                                      <span className="min-w-0 flex-1">
                                        <span className="font-medium text-foreground">{lead.company_name}</span>
                                        {lead.contact_name ? <span className="text-muted-foreground"> · {[lead.contact_name, lead.contact2_name].filter(Boolean).join(", ")}</span> : null}
                                        <span className="block text-muted-foreground">
                                          {[lead.address, lead.city, lead.state, lead.zip].filter(Boolean).join(", ") || "No address"}{lead.phone ? ` · ${lead.phone}` : ""}
                                        </span>
                                      </span>
                                      <span className="flex shrink-0 flex-wrap justify-end gap-1">
                                        {lead.ein ? <ToneBadge tone="emerald">FEIN</ToneBadge> : null}
                                        <ToneBadge tone="slate">{contacts} contact{contacts === 1 ? "" : "s"}</ToneBadge>
                                        <ToneBadge tone={kept ? "cyan" : "rose"}>{kept ? "Keep" : "Deletion"}</ToneBadge>
                                      </span>
                                    </label>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-muted-foreground" data-no-duplicates>No duplicates found.</p>
                  )}
                  {plan.removedRows.length ? (
                    <div className="rounded-lg border border-[var(--panel-border)]">
                      <button type="button" onClick={() => setShowRemoved((v) => !v)} data-show-removed
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40">
                        {showRemoved ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        <UserX className="size-4 text-rose-500" />
                        <span>
                          <span className="font-semibold tabular-nums" data-removed-count>{plan.removedRows.length.toLocaleString()}</span> name{plan.removedRows.length === 1 ? "" : "s"} {plan.client ?? "the client"} took off before, left out
                        </span>
                        <span className="ml-auto shrink-0 font-semibold text-primary">{showRemoved ? "Hide" : "Show"}</span>
                      </button>
                      {showRemoved ? (
                        <ul className="max-h-72 divide-y divide-[var(--panel-border)] overflow-y-auto border-t border-[var(--panel-border)] text-xs">
                          {plan.removedRows.map(({ i, entry }) => (
                            <li key={i} className="flex items-center gap-3 px-3 py-1.5">
                              <span className="min-w-0 flex-1 truncate">
                                <span className="font-medium">{plan.rows[i].lead.company_name}</span>
                                <span className="text-muted-foreground"> · {[plan.rows[i].lead.city, plan.rows[i].lead.phone].filter(Boolean).join(" · ")}</span>
                              </span>
                              <ToneBadge tone="rose">{reasonLabel(entry.reason)}</ToneBadge>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                  {plan.existingRows.length ? (
                    <div className="rounded-lg border border-[var(--panel-border)]">
                      <button type="button" onClick={() => setShowExisting((v) => !v)} data-show-existing
                        className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-muted/40">
                        {showExisting ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                        <Layers className="size-4 text-sky-500" />
                        <span>
                          <span className="font-semibold tabular-nums" data-existing-count>{plan.existingRows.length.toLocaleString()}</span> already on this project or its appointment project, left out
                          <span className="text-muted-foreground"> · the record there, with its call history, is kept</span>
                        </span>
                        <span className="ml-auto shrink-0 font-semibold text-primary">{showExisting ? "Hide" : "Show"}</span>
                      </button>
                      {showExisting ? (
                        <ul className="max-h-72 divide-y divide-[var(--panel-border)] overflow-y-auto border-t border-[var(--panel-border)] text-xs">
                          {plan.existingRows.map(({ i, entry }) => (
                            <li key={i} className="flex items-center gap-3 px-3 py-1.5">
                              <span className="min-w-0 flex-1 truncate">
                                <span className="font-medium">{plan.rows[i].lead.company_name}</span>
                                <span className="text-muted-foreground"> · {[plan.rows[i].lead.city, plan.rows[i].lead.phone].filter(Boolean).join(" · ")}</span>
                              </span>
                              <span className="shrink-0 text-muted-foreground">{entry.project}</span>
                              {entry.result ? <ToneBadge tone="sky">{entry.result}</ToneBadge> : null}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>
                  ) : null}
                </>
              ) : null}
            </div>
          ) : null}
        </form>
      </CardContent>
    </Card>
  );
}
