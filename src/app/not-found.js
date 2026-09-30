import NotFoundPanel from "@/components/layout/not-found-panel";

/** A 404 outside the workspace, e.g. under a sign-in page. */
export default function NotFound() {
  return (
    <main className="flex min-h-svh">
      <NotFoundPanel />
    </main>
  );
}
