"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { TableCell, TableRow } from "@/components/ui/table";
import CallTranscript from "@/features/texts/components/call-transcript";

/**
 * Under a recorded call on the Call Log (Nov 2026): "Show transcription", opening the call's transcript
 * beneath it like a drop-down, with its AI summary, as on the lead's Conversation. One still being
 * transcribed is looked at again every so often.
 */
export default function CallLogTranscript({ sid, transcript, ours, theirs, colSpan }) {
  const router = useRouter();
  const waiting = transcript?.status === "transcribing";
  useEffect(() => {
    if (!waiting) return;
    const t = setInterval(() => router.refresh(), 15000);
    return () => clearInterval(t);
  }, [waiting, router]);
  if (!transcript) return null;
  return (
    <TableRow className="hover:bg-transparent" data-call-transcript-row={sid}>
      <TableCell colSpan={colSpan} className="pb-3 pt-0">
        <div className="max-w-3xl">
          <CallTranscript sid={sid} transcript={transcript} ours={ours} theirs={theirs} noun="transcription" onChanged={() => router.refresh()} />
        </div>
      </TableCell>
    </TableRow>
  );
}
