import { Fragment } from "react";
import Link from "@/components/shared/intent-link";
import { linkParts } from "@/lib/linkify";

/** Text as written, its web addresses and Lighthouse pages (/leads/123) made links (src/lib/linkify.js). */
export default function LinkedText({ text, className = "underline underline-offset-2 hover:opacity-80" }) {
  return linkParts(text).map((p, i) => (
    p.href == null ? <Fragment key={i}>{p.text}</Fragment>
      : p.internal ? <Link key={i} href={p.href} className={className} data-message-link>{p.href}</Link>
      : <a key={i} href={p.href} target="_blank" rel="noopener noreferrer" className={className} data-message-link>{p.href}</a>
  ));
}
