"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { setProjectInfoOwn } from "@/features/project-info/actions";
import { reach } from "@/lib/reach";

/**
 * On a DB dev project tied to an appointment project (Sean, Oct 2026): it
 * shares that project's Project Info, one sheet for them all, or keeps its
 * own when it needs to differ (starting from a copy of the shared one).
 */
export default function OwnInfoSwitch({ projectId, own, tiedName }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const flip = () =>
    start(async () => {
      const f = new FormData();
      f.set("project_id", String(projectId));
      f.set("own", own ? "0" : "1");
      const result = await reach(() => setProjectInfoOwn(f));
      if (result.ok) {
        toast.success(own ? `Using ${tiedName}'s Project Info again` : "This project now has its own Project Info, copied from the shared one");
        router.refresh();
      } else toast.error(result.error);
    });
  return (
    <Button size="sm" variant="ghost" onClick={flip} disabled={pending} data-own-info={own ? "own" : "shared"}
      title={own ? `Share ${tiedName}'s Project Info again (this project's own is kept aside)` : `Give this project its own Project Info, apart from ${tiedName}'s`}>
      {own ? <Link2 /> : <Unlink />} {own ? "Use the shared one" : "Keep its own"}
    </Button>
  );
}
