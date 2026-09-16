import { Database, KeyRound, TerminalSquare, AlertTriangle } from "lucide-react";
import BeaconWordmark from "@/components/logo-wordmark";
import { SUPABASE_URL } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

// Shown when the deployment has no usable Supabase configuration. It reads no
// data, so it renders even when nothing else can.
export default async function SetupPage({ searchParams }) {
  const sp = await searchParams;
  const reason = sp?.reason === "localhost" ? "localhost" : "missing";

  const steps = [
    {
      icon: Database,
      title: "Create a Supabase project",
      body: (
        <>
          At <span className="text-primary">supabase.com/dashboard</span>, create a project. Note the{" "}
          <em>Project URL</em> and the <em>anon / publishable</em> key under <em>Settings → API</em>.
        </>
      ),
    },
    {
      icon: TerminalSquare,
      title: "Push the schema and seed data",
      body: (
        <pre className="mt-2 overflow-x-auto rounded-md border border-[var(--panel-border)] bg-secondary/50 p-3 text-xs leading-relaxed text-foreground/90">
{`npx supabase login
npx supabase link --project-ref <your-project-ref>
npm run db:push        # migrations + seed`}
        </pre>
      ),
    },
    {
      icon: KeyRound,
      title: "Set the environment variables, then redeploy",
      body: (
        <>
          In Vercel: <em>Project → Settings → Environment Variables</em>. These are inlined at build
          time, so trigger a new deployment after saving.
          <pre className="mt-2 overflow-x-auto rounded-md border border-[var(--panel-border)] bg-secondary/50 p-3 text-xs leading-relaxed text-foreground/90">
{`NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon or publishable key>`}
          </pre>
        </>
      ),
    },
  ];

  return (
    <div
      className="relative grid min-h-svh place-items-center overflow-hidden p-4"
      style={{ background: "radial-gradient(120% 90% at 50% -10%, #223258 0%, #0e1830 55%, #080d19 100%)" }}
    >
      <div className="relative w-full max-w-2xl">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <BeaconWordmark className="h-12 w-auto text-white" />
          <div className="text-sm text-white/55">Signature Marketing · Lead Management</div>
        </div>

        <div className="rounded-2xl border border-white/12 bg-white/8 p-6 shadow-2xl backdrop-blur-xl">
          <div className="flex items-start gap-3 rounded-lg border border-amber-400/40 bg-amber-400/10 p-4">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-400" />
            <div>
              <div className="text-sm font-bold uppercase tracking-[0.14em] text-amber-300">
                Database not configured
              </div>
              <p className="mt-1 text-sm text-white/75">
                {reason === "localhost" ? (
                  <>
                    This deployment points at <code className="rounded bg-black/30 px-1.5 py-0.5 text-xs">{SUPABASE_URL}</code>,
                    which is the local development stack and is not reachable from here. Point it at a hosted
                    Supabase project instead.
                  </>
                ) : (
                  <>
                    <code className="rounded bg-black/30 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
                    <code className="rounded bg-black/30 px-1.5 py-0.5 text-xs">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> are
                    not set for this deployment, so the app has no database to talk to.
                  </>
                )}
              </p>
            </div>
          </div>

          <ol className="mt-6 space-y-5">
            {steps.map((s, i) => {
              const Icon = s.icon;
              return (
                <li key={s.title} className="flex gap-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-white/15 bg-white/5 text-primary">
                    <Icon className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[0.66rem] font-bold uppercase tracking-[0.18em] text-white/45">Step {i + 1}</div>
                    <div className="mt-0.5 font-semibold text-white">{s.title}</div>
                    <div className="mt-1 text-sm text-white/70">{s.body}</div>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <p className="mt-4 text-center text-[0.7rem] text-white/35">
          Running locally? <code className="text-white/60">npm run db:start</code> writes these values to{" "}
          <code className="text-white/60">.env.local</code>.
        </p>
      </div>
    </div>
  );
}
