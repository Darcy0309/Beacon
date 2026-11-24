"use client";

import { Camera, Loader2, X } from "lucide-react";
import { usePicture } from "@/components/shared/picture-upload";
import { setMyPhoto } from "@/features/auth/actions";
import { cn } from "@/lib/utils";

/**
 * My Profile's avatar (Nov 2026): your photo, or your initials. Staff click it to add or change their photo (shown on
 * Meet the Team and beside their name), and take it away with its ×. A client's is the initials, to look at.
 */
export default function ProfileAvatar({ userId, path, initials, editable = false }) {
  const { input, busy, url, choose, remove } = usePicture({ folder: `user/${userId}`, path, kind: "photo", save: setMyPhoto });
  const face = url ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt="Your photo" className="size-full object-cover" data-picture />
  ) : initials;
  const ring = "flex size-20 shrink-0 items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-[var(--neon-cyan)] to-[var(--neon-blue)] text-2xl font-bold text-[var(--background)]";
  if (!editable) return <div className={ring}>{face}</div>;
  return (
    <div className="relative shrink-0" data-profile-avatar>
      <button type="button" onClick={() => input.current?.click()} disabled={Boolean(busy)}
        title={url ? "Change your photo" : "Add a photo"} aria-label={url ? "Change your photo" : "Add a photo"}
        className={cn(ring, "group relative cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background")}
        data-choose-picture>
        {face}
        {/* Pointed at, or busy: what a click does. */}
        <span className={cn("absolute inset-0 flex flex-col items-center justify-center gap-0.5 bg-black/55 text-[0.65rem] font-semibold text-white transition-opacity",
          busy ? "opacity-100" : "opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100")}>
          {busy ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <Camera className="size-5" aria-hidden />}
          {busy ?? (url ? "Change" : "Add photo")}
        </span>
      </button>
      {url && !busy ? (
        <button type="button" onClick={remove} title="Remove your photo" aria-label="Remove your photo"
          className="absolute -right-0.5 -top-0.5 flex size-6 items-center justify-center rounded-full border border-[var(--panel-border)] bg-card text-muted-foreground shadow transition-colors hover:text-destructive"
          data-remove-picture>
          <X className="size-3.5" />
        </button>
      ) : null}
      <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => choose(e.target.files?.[0])} data-picture-file />
    </div>
  );
}
