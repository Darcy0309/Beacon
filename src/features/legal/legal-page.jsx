import Link from "next/link";

/** The frame the Privacy Policy and Terms pages share: plain, readable, linked to each other. */
export function LegalPage({ title, org, updated, children }) {
  return (
    <div className="min-h-svh bg-background text-foreground">
      <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6">
        <div className="text-sm text-muted-foreground">{org.name}</div>
        <h1 className="mt-1 text-3xl font-bold tracking-tight" data-legal-title>{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {updated}</p>
        <div className="mt-8 space-y-8 text-[0.95rem] leading-7">{children}</div>
        <footer className="mt-12 flex flex-wrap gap-x-6 gap-y-2 border-t pt-6 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} {org.name}</span>
          <Link href="/privacy" className="underline underline-offset-4">Privacy Policy</Link>
          <Link href="/terms" className="underline underline-offset-4">Terms &amp; Conditions</Link>
        </footer>
      </main>
    </div>
  );
}

export function Section({ title, children }) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

export function Contact({ org }) {
  return (
    <ul className="list-disc space-y-1 pl-6">
      <li>Email: <a href={`mailto:${org.email}`} className="underline underline-offset-4">{org.email}</a></li>
      {org.phone ? <li>Phone: {org.phone}</li> : null}
    </ul>
  );
}
