"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MoreHorizontal, Eye, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

/**
 * Row menu. `href` adds an Open link; `onDelete` (a server action taking
 * FormData with `id`) adds a confirmed Delete. Extra menu entries can be passed
 * as `children`.
 */
export default function RowActions({ name = "record", href, id, onDelete, children }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function remove() {
    startTransition(async () => {
      const fd = new FormData();
      fd.set("id", String(id));
      const res = await onDelete(fd);
      if (res?.ok === false) {
        toast.error(res.error ?? "Could not delete that record.");
      } else {
        toast.success(`Deleted ${name}`);
        setConfirming(false);
        router.refresh();
      }
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${name}`}>
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel className="max-w-48 truncate">{name}</DropdownMenuLabel>
          {href ? (
            <DropdownMenuItem asChild>
              <Link href={href}>
                <Eye /> Open
              </Link>
            </DropdownMenuItem>
          ) : null}
          {children}
          {onDelete ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setConfirming(true)}>
                <Trash2 /> Delete
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>

      {onDelete ? (
        <Dialog open={confirming} onOpenChange={setConfirming}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Delete {name}?</DialogTitle>
              <DialogDescription>
                This permanently removes the record. It cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirming(false)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={remove} disabled={pending}>
                {pending ? "Deleting…" : "Delete"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      ) : null}
    </>
  );
}
