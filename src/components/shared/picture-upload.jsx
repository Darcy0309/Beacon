"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ImagePlus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";
import { IMAGES_BUCKET, imageUrl, initialsOf, shrinkPicture } from "@/lib/images";
import { cn } from "@/lib/utils";

/**
 * A picture to add, change or take away: a person's photo (round, cropped
 * square) or a client's logo (whole). Put in the public-images bucket under
 * `folder` (user/<id> or company/<id>), then `save(path | null)` (a server
 * action) keeps it; the one it replaces is taken out of the bucket.
 *
 *   path   the picture now, or null
 *   name   whose it is: their initials stand in for a photo
 *   kind   "photo" | "logo"
 */
export default function PictureUpload({ folder, path, name, kind = "photo", save, label }) {
  const router = useRouter();
  const input = useRef(null);
  const [busy, setBusy] = useState(null);
  const photo = kind === "photo";
  const url = imageUrl(path);

  const keep = async (next) => {
    const result = await save(next);
    if (!result?.ok) throw new Error(result?.error ?? "That could not be saved.");
    // The one replaced, out of the bucket (best-effort: a stray one does no harm).
    if (path && path !== next) await createClient().storage.from(IMAGES_BUCKET).remove([path]).catch(() => {});
  };

  const choose = async (file) => {
    if (!file) return;
    setBusy("Adding…");
    try {
      const { blob, ext } = await shrinkPicture(file, photo ? { size: 400, square: true } : { size: 600 });
      const next = `${folder}/${Date.now().toString(36)}.${ext}`;
      const { error } = await createClient().storage.from(IMAGES_BUCKET).upload(next, blob, { contentType: blob.type, upsert: false });
      if (error) throw new Error(/row-level|policy|unauthor/i.test(error.message) ? "That is not yours to change." : error.message);
      await keep(next);
      toast.success(photo ? "Your photo is up" : "The logo is up");
      router.refresh();
    } catch (err) {
      toast.error(err?.message ?? "That picture could not be used.");
    } finally {
      setBusy(null);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async () => {
    setBusy("Removing…");
    try {
      await keep(null);
      toast.success(photo ? "Photo removed" : "Logo removed");
      router.refresh();
    } catch (err) {
      toast.error(err?.message ?? "That could not be removed.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex items-center gap-4" data-picture-upload={kind}>
      <span className={cn("flex shrink-0 items-center justify-center overflow-hidden border border-[var(--panel-border)] bg-muted",
        photo ? "size-20 rounded-full" : "h-20 w-36 rounded-lg p-2")}>
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={photo ? `${name ?? "Your"} photo` : `${name ?? "Client"} logo`} className={photo ? "size-full object-cover" : "max-h-full max-w-full object-contain"} data-picture />
        ) : photo ? (
          <span className="text-xl font-bold text-muted-foreground">{initialsOf(name)}</span>
        ) : (
          <span className="text-xs text-muted-foreground">No logo</span>
        )}
      </span>
      <div className="flex flex-col items-start gap-2">
        {label ? <span className="text-xs text-muted-foreground">{label}</span> : null}
        <div className="flex flex-wrap gap-2">
          <Button type="button" size="sm" variant="outline" disabled={Boolean(busy)} onClick={() => input.current?.click()} data-choose-picture>
            <ImagePlus /> {busy ?? (url ? `Change ${photo ? "photo" : "logo"}` : `Add ${photo ? "a photo" : "a logo"}`)}
          </Button>
          {url ? (
            <Button type="button" size="sm" variant="ghost" disabled={Boolean(busy)} onClick={remove} data-remove-picture>
              <Trash2 /> Remove
            </Button>
          ) : null}
        </div>
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => choose(e.target.files?.[0])} data-picture-file />
      </div>
    </div>
  );
}
