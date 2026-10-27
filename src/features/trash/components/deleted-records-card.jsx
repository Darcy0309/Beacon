"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArchiveRestore, Undo2 } from "lucide-react";
import SectionHeader from "@/components/shared/section-header";
import ConfirmDialog from "@/components/shared/confirm-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { dateTime } from "@/lib/format";
import { restoreRecord } from "@/features/trash/actions";
import { reach } from "@/lib/reach";

/**
 * Deleted records: what people have deleted, which Lighthouse keeps (a
 * delete only hides a record), and a way to bring each back with whatever
 * went with it. `records`: getDeletedRecords().
 */
export default function DeletedRecordsCard({ records }) {
  const router = useRouter();
  const [asking, setAsking] = useState(null);
  const [pending, start] = useTransition();
  const restore = (r) =>
    start(async () => {
      const f = new FormData();
      f.set("kind", r.kind);
      f.set("id", String(r.id));
      f.set("name", r.name);
      const result = await reach(() => restoreRecord(f));
      if (result.ok) {
        toast.success(`${r.name} is back`);
        setAsking(null);
        router.refresh();
      } else toast.error(result.error);
    });
  const also = (r) => (r.also ? ` with ${r.also.toLocaleString()} record${r.also === 1 ? "" : "s"} of its own` : "");

  return (
    <Card data-deleted-records>
      <SectionHeader label="Deleted Records" icon={ArchiveRestore} />
      <p className="px-5 pt-4 text-sm text-muted-foreground">
        Deleting takes a record out of Lighthouse for everyone, but nothing is erased. Restore brings it back as it was, with what went with it
        (a client&apos;s projects, a project&apos;s leads, a lead&apos;s appointments).
      </p>
      {records.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground" data-none-deleted>Nothing has been deleted.</p>
      ) : (
        <div className="p-2 pt-3">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Record</TableHead>
                <TableHead>Kind</TableHead>
                <TableHead>Deleted</TableHead>
                <TableHead>By</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {records.map((r) => (
                <TableRow key={`${r.kind}:${r.id}`} data-deleted={`${r.kind}:${r.id}`}>
                  <TableCell>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {[r.detail, r.also ? `${r.also.toLocaleString()} record${r.also === 1 ? "" : "s"} went with it` : null].filter(Boolean).join(" · ")}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.label}</TableCell>
                  <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground">{dateTime(r.deletedAt)}</TableCell>
                  <TableCell className="text-muted-foreground">{r.deletedBy ?? "—"}</TableCell>
                  <TableCell className="text-right">
                    <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setAsking(r)} data-restore><Undo2 /> Restore</Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
      <ConfirmDialog open={asking !== null} onOpenChange={(o) => !o && setAsking(null)} pending={pending} destructive={false}
        title={asking ? `Restore ${asking.name}?` : ""}
        description={asking ? `The ${asking.label.toLowerCase()} comes back${also(asking)}, as it was when it was deleted${asking.kind === "users" ? ". It comes back disabled, with no sign-in: enable it and invite them again" : ""}.` : null}
        confirm="Restore" icon={<Undo2 />} onConfirm={() => restore(asking)} />
    </Card>
  );
}
