/**
 * Files kept in Lighthouse (a lead's policy files): which a browser shows
 * itself, and the addresses that open or download one. Pure, so the server's
 * routes, the viewer and the tests share it.
 */

// Shown in the browser: PDFs, pictures and plain text. Not SVG (a picture that can run script), nor the
// kinds a browser only downloads (Word, Excel, an email).
const SHOWN = { PDF: "pdf", PNG: "image", JPG: "image", JPEG: "image", GIF: "image", WEBP: "image", BMP: "image", TXT: "text" };

/** A file's extension, upper-case ("PDF"), from its name; null without one. */
export const extensionOf = (name) => /\.([a-z0-9]{1,8})$/i.exec(String(name ?? "").trim())?.[1]?.toUpperCase() ?? null;

/** How a browser shows a file: "pdf", "image" or "text"; null when it can only be downloaded. `type`: the kept file type ("PDF"). */
export const fileKind = (name, type = null) => SHOWN[String(type || extensionOf(name) || "").toUpperCase()] ?? null;

/** Where a kept file opens (in the browser, when it can show it) or, with `download`, is saved under its own name. */
export const fileHref = (id, { download = false } = {}) => `/api/files/${id}${download ? "?download=1" : ""}`;
