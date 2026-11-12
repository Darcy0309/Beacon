"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, ChevronDown, UserCog } from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ConfirmDialog from "@/components/shared/confirm-dialog";
import { setProjectManager } from "@/features/projects/actions";
import { reach } from "@/lib/reach";

const list = (names) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

/**
 * The Projects list's Manager column (client, Nov 2026): the project's manager, a menu of the account
 * managers to change it to, and "are you sure?" before it changes (set_project_manager(): in place of
 * the managers on it now, its agents staying, its names still to call shared out again).
 *
 *   label     what the column shows now ("Kristy W.", "Unassigned")
 *   current   its managers [{ id, name }]
 *   people    who can manage it [{ id, name, role }]: account managers and administrators
 */
export default function ProjectManagerCell({ projectId, projectName, label, current = [], people = [] }) {
  const router = useRouter();
  const [chosen, setChosen] = useState(null);
  const [pending, startTransition] = useTransition();
  const mine = new Set(current.map((m) => m.id));
  const others = current.filter((m) => m.id !== chosen?.id).map((m) => m.name);

  const change = () =>
    startTransition(async () => {
      const f = new FormData();
      f.set("project_id", String(projectId));
      f.set("user_id", String(chosen.id));
      const result = await reach(() => setProjectManager(f));
      if (!result?.ok) {
        toast.error(result?.error || "The manager could not be changed.");
        return;
      }
      toast.success(`${chosen.name} manages ${projectName} now`, { description: result.data?.message });
      setChosen(null);
      router.refresh();
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" data-project-manager={projectId}
            className="group -mx-2 inline-flex max-w-full cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 data-[state=open]:bg-muted/60"
            title="Change who manages this project">
            <span className={`truncate ${current.length ? "" : "text-muted-foreground"}`}>{label}</span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 min-w-56 overflow-y-auto" data-project-manager-menu>
          <DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-muted-foreground"><UserCog className="size-3.5" /> Manager of this project</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {people.length ? people.map((p) => (
            <DropdownMenuItem key={p.id} data-manager-choice={p.id} disabled={mine.has(p.id) && current.length === 1}
              onSelect={() => !(mine.has(p.id) && current.length === 1) && setChosen(p)}>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              {p.role === "admin" ? <span className="text-[0.66rem] text-muted-foreground">Admin</span> : null}
              {mine.has(p.id) ? <Check className="size-3.5 text-primary" /> : null}
            </DropdownMenuItem>
          )) : <div className="px-2 py-1.5 text-xs text-muted-foreground">No account managers yet.</div>}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={Boolean(chosen)}
        onOpenChange={(o) => !o && setChosen(null)}
        title="Change the project's manager?"
        description={chosen ? (
          <>
            Are you sure you want to change <strong className="text-foreground">{projectName}</strong>&apos;s manager to{" "}
            <strong className="text-foreground">{chosen.name}</strong>?
            {others.length ? <> {list(others)} will come off it.</> : null} Its names still to call are shared out again; agents on it stay.
          </>
        ) : null}
        confirm="Change manager"
        icon={<UserCog />}
        destructive={false}
        pending={pending}
        onConfirm={change}
      />
    </>
  );
}
