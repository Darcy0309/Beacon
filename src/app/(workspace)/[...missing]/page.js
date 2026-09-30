import { notFound } from "next/navigation";

/**
 * Any address that matches no page. Answered inside the workspace, so a
 * signed-in person's 404 keeps the sidebar and a way back.
 */
export default function UnknownPage() {
  notFound();
}
