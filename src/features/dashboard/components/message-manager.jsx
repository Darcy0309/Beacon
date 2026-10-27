"use client";

import { useState, useTransition } from "react";
import { MessageSquare, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { messageManager } from "@/features/dashboard/actions";
import { reach } from "@/lib/reach";

/**
 * The manager who developed a lead, on a client's Recent Activity (Sean, Oct
 * 2026): their name opens a note to them about that lead, delivered as a
 * message in their notifications (on their dashboard too), with a link to it.
 */
export default function MessageManager({ leadId, managerId, manager, company }) {
  const [open, setOpen] = useState(false);
  const [body, setBody] = useState("");
  const [pending, start] = useTransition();
  if (!managerId) return <span>{manager}</span>;
  const send = (e) => {
    e.preventDefault();
    start(async () => {
      const f = new FormData();
      f.set("lead_id", String(leadId));
      f.set("manager_id", String(managerId));
      f.set("body", body);
      const result = await reach(() => messageManager(f));
      if (result.ok) {
        toast.success(`Sent to ${manager}`);
        setBody("");
        setOpen(false);
      } else toast.error(result.error);
    });
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} data-message-manager={managerId}
        className="inline-flex items-center gap-1 text-left text-primary underline-offset-2 hover:underline" title={`Message ${manager} about ${company}`}>
        {manager} <MessageSquare className="size-3 shrink-0" aria-hidden />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md" data-message-manager-dialog>
          <DialogHeader>
            <DialogTitle>Message {manager}</DialogTitle>
            <DialogDescription>About {company}. It reaches them as a message in Lighthouse, with a link to this lead.</DialogDescription>
          </DialogHeader>
          <form onSubmit={send} className="flex flex-col gap-4">
            <Textarea name="body" rows={5} maxLength={1000} autoFocus value={body} onChange={(e) => setBody(e.target.value)}
              placeholder="e.g. Can you confirm the owner's email before Thursday's meeting?" data-message-body />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={pending}>Cancel</Button>
              <Button type="submit" disabled={pending || !body.trim()} data-send-message><Send /> {pending ? "Sending…" : "Send"}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
