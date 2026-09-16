"use client";

import { useActionState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Select } from "@/components/ui/field";
import { postBulletin } from "@/lib/actions";

const EMPTY = { ok: false, data: null, error: null };

export default function BulletinComposer({ projects = [] }) {
  const [state, formAction, pending] = useActionState(postBulletin, EMPTY);
  const formRef = useRef(null);
  const router = useRouter();

  useEffect(() => {
    if (state?.ok) {
      toast.success("Announcement posted");
      formRef.current?.reset();
      router.refresh();
    } else if (state?.error) {
      toast.error(state.error);
    }
  }, [state, router]);

  return (
    <Card>
      <CardContent className="p-5">
        <form ref={formRef} action={formAction} className="space-y-3">
          <Textarea
            name="message"
            required
            maxLength={100}
            placeholder="Share an announcement with the team…"
          />
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Select name="message_type" defaultValue="IN" className="h-9 w-auto">
              <option value="IN">Info</option>
              <option value="AL">Alert</option>
            </Select>
            <Select name="project_id" defaultValue="" className="h-9 w-auto max-w-[14rem]">
              <option value="">All projects</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </Select>
            <Button size="sm" type="submit" disabled={pending}>
              {pending ? "Posting…" : "Post announcement"}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
