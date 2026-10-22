/**
 * Pictures anyone signed in may see (the public-images bucket): staff photos
 * under user/<id>/, client logos under company/<id>/. Kept in the database as
 * the path in the bucket, never as an address, and shown from here.
 */

import { SUPABASE_URL } from "@/lib/supabase/config";

export const IMAGES_BUCKET = "public-images";

/** The address a picture is shown from; null without one. */
export const imageUrl = (path) => (path ? `${SUPABASE_URL}/storage/v1/object/public/${IMAGES_BUCKET}/${path}` : null);

/** "Jane Smith" -> "JS": in place of a photo. */
export const initialsOf = (name) =>
  String(name ?? "").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join("") || "?";

const canvasBlob = (canvas, type, quality) => new Promise((resolve) => canvas.toBlob(resolve, type, quality));

/**
 * A picture chosen to upload, made small enough to show quickly: a photo
 * cropped square to `size` (the middle of it), a logo kept whole within
 * `size` and its see-through parts kept. WebP where the browser makes it,
 * else JPEG (a photo) or PNG (a logo). Resolves to { blob, ext }.
 */
export function shrinkPicture(file, { size = 400, square = false } = {}) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\/(png|jpe?g|webp|gif)$/i.test(file.type)) return reject(new Error("Choose a picture: JPG, PNG or WebP."));
    if (file.size > 15 * 1024 * 1024) return reject(new Error("That picture is over 15 MB. Choose a smaller one."));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = async () => {
      URL.revokeObjectURL(url);
      const w = img.naturalWidth, h = img.naturalHeight;
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (square) {
        const side = Math.min(w, h), out = Math.min(size, side);
        canvas.width = canvas.height = out;
        ctx.drawImage(img, (w - side) / 2, (h - side) / 2, side, side, 0, 0, out, out);
      } else {
        const scale = Math.min(1, size / Math.max(w, h));
        canvas.width = Math.max(1, Math.round(w * scale));
        canvas.height = Math.max(1, Math.round(h * scale));
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
      let blob = await canvasBlob(canvas, "image/webp", 0.86);
      let ext = "webp";
      if (!blob || blob.type !== "image/webp") {
        ext = square ? "jpg" : "png";
        blob = await canvasBlob(canvas, square ? "image/jpeg" : "image/png", 0.86);
      }
      if (!blob) return reject(new Error("That picture could not be used. Try a JPG or PNG."));
      resolve({ blob, ext });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("That picture could not be opened. Try a JPG or PNG."));
    };
    img.src = url;
  });
}
