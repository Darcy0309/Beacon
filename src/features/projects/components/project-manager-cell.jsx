"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ChevronDown, UserCog, UserMinus, UserPlus } from "lucide-react";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import ConfirmDialog from "@/components/shared/confirm-dialog";
import { setProjectRep } from "@/features/projects/actions";
import { reach } from "@/lib/reach";

const list = (names) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`);

/**
 * The Projects list's Manager column (client, Nov 2026): a project's managers, and a menu of the account
 * managers to add to it or take off it, one at a time, each asked first (Sean: "we usually have multiple
 * managers on a project", two or three on an appointment project). The others on it stay; its names still
 * to call are shared out again (set_project_rep()).
 *
 *   label     what the column shows now ("Kristy W., Jen B.", "Unassigned")
 *   current   its managers [{ id, name }]
 *   people    who can manage it [{ id, name, role }]: account managers and administrators
 */
export default function ProjectManagerCell({ projectId, projectName, label, current = [], people = [] }) {
  const router = useRouter();
  // { person, on }: who is being added (on) or taken off.
  const [asked, setAsked] = useState(null);
  const [pending, startTransition] = useTransition();
  const mine = new Set(current.map((m) => m.id));
  const staying = current.filter((m) => m.id !== asked?.person.id).map((m) => m.name);

  const change = () =>
    startTransition(async () => {
      const { person, on } = asked;
      const f = new FormData();
      f.set("project_id", String(projectId));
      f.set("user_id", String(person.id));
      f.set("on", on ? "1" : "0");
      const result = await reach(() => setProjectRep(f));
      if (!result?.ok) {
        toast.error(result?.error || "The managers could not be changed.");
        return;
      }
      toast.success(on ? `${person.name} is a manager on ${projectName} now` : `${person.name} is off ${projectName}`, { description: result.data?.message });
      setAsked(null);
      router.refresh();
    });

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" data-project-manager={projectId}
            className="group -mx-2 inline-flex max-w-full cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 data-[state=open]:bg-muted/60"
            title="Add or take off this project's managers">
            <span className={`truncate ${current.length ? "" : "text-muted-foreground"}`}>{label}</span>
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground opacity-60 transition-opacity group-hover:opacity-100" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 min-w-56 overflow-y-auto" data-project-manager-menu>
          <DropdownMenuLabel className="flex items-center gap-1.5 text-xs text-muted-foreground"><UserCog className="size-3.5" /> Managers of this project</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {people.length ? people.map((p) => (
            <DropdownMenuCheckboxItem key={p.id} data-manager-choice={p.id} checked={mine.has(p.id)}
              onSelect={() => setAsked({ person: p, on: !mine.has(p.id) })}>
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              {p.role === "admin" ? <span className="text-[0.66rem] text-muted-foreground">Admin</span> : null}
            </DropdownMenuCheckboxItem>
          )) : <div className="px-2 py-1.5 text-xs text-muted-foreground">No account managers yet.</div>}
        </DropdownMenuContent>
      </DropdownMenu>

      <ConfirmDialog
        open={Boolean(asked)}
        onOpenChange={(o) => !o && setAsked(null)}
        title={asked?.on ? "Add a manager?" : "Take this manager off?"}
        description={asked ? (
          <>
            {asked.on ? "Add " : "Take "}<strong className="text-foreground">{asked.person.name}</strong>
            {asked.on ? " as a manager on " : " off "}<strong className="text-foreground">{projectName}</strong>?{" "}
            {staying.length
              ? <>{list(staying)} {staying.length === 1 ? "stays" : "stay"} on it. </>
              : !asked.on ? <>It will have no manager. </> : null}
            Its names still to call are shared out again.
          </>
        ) : null}
        confirm={asked?.on ? "Add manager" : "Take off"}
        icon={asked?.on ? <UserPlus /> : <UserMinus />}
        destructive={!asked?.on}
        pending={pending}
        onConfirm={change}
      />
    </>
  );
}
