# Lighthouse CRM

Lead-generation and appointment-setting CRM for Signature Marketing — a working
rebuild of the legacy DCMPower / BeaconApp (VB.NET + ASP.NET Web Forms + SQL
Server) on Next.js and Supabase.

This is a real application: PostgreSQL schema, Supabase Auth, Row Level
Security, and full create/read/update/delete on every module. Nothing is mocked.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router, Turbopack, Server Components + Server Actions) |
| UI | Tailwind CSS v4, shadcn/ui, lucide-react |
| Database | PostgreSQL 17 (Supabase) |
| Auth | Supabase Auth (email + password) |
| Security | PostgreSQL Row Level Security |

## Getting started

Requires Node 20+, Docker, and the [Supabase CLI](https://supabase.com/docs/guides/cli).

```bash
npm install
npm run db:start     # starts Postgres + Auth + Studio in Docker, applies
                     # migrations and seeds data (first run pulls ~9GB of images)
npm run dev          # http://localhost:3000
```

`npm run db:start` prints the local API URL and keys. Put them in `.env.local`
(see `.env.example`):

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>   # server only: user administration
```

### Demo accounts

All use the password `Beacon!2026`:

| Email | Role | Sees |
|---|---|---|
| `admin@beacon.test` | Administrator | Everything, including users and IP lockdown |
| `sean@beacon.test` | Account Manager | All accounts, leads and appointments |
| `agent@beacon.test` | Agent | Leads, appointments, QA, bulletin |
| `client@beacon.test` | Client | Only their own company's projects and leads |

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Development server |
| `npm run build` | Production build |
| `npm test` | Unit tests (no database needed) |
| `npm run test:integration` | Row Level Security role by role, the lead lifecycle and the admin reports, against the local stack |
| `npm run test:e2e` | The running app in headless Chrome: pages, dashboard, call lists, admin side, navigation, calendar, forms, security, notifications |
| `npm run test:all` | Everything above |
| `npm run db:start` / `db:stop` | Start / stop the local Supabase stack |
| `npm run db:reset` | Drop, re-run migrations, re-seed |
| `npm run db:bundle` | Rebuild `supabase/deploy.sql` from the migrations and seed |
| `npm run db:studio` | Print the Supabase Studio URL (http://127.0.0.1:54323) |

The integration and end-to-end tests only ever run against the local stack:
they refuse any Supabase or app URL that is not localhost.

## Project layout

```
src/
  app/(auth)/          sign-in, setup, email links (no sidebar)
  app/(workspace)/     every signed-in page
  app/api/             route handlers
  features/<feature>/  actions.js (writes) · queries.js (reads) · components/
  components/          ui/ · layout/ · brand/ · shared/
  lib/                 server/ kernel · supabase/ clients · format · validate · nav
  proxy.js             session refresh + route protection (Next 16's middleware)
supabase/              migrations/ · seed.sql · deploy.sql (generated)
tests/                 unit/ · integration/ · e2e/ · support/
scripts/               deploy.sql bundler, demo data, screenshots
docs/                  architecture.md, build plan
```

See **[docs/architecture.md](docs/architecture.md)** for what goes where and why.

## Data model

Ported from the legacy SQL Server schema in `../sql/DocumentsCDMPOWER.sql`
(structure only — those dumps carry no rows, so the seed supplies data).

| Legacy table | Here |
|---|---|
| `UserMaster`, `UserType` | `users`, `user_types` |
| `CompanyMaster` | `companies` (the "Clients" screen) |
| `ProjectMaster`, `ClientAssignProject` | `projects`, `project_assignments` |
| `LEADMASTER`, `LEADSTATUS`, `LeadCompany` | `leads`, `lead_statuses` |
| `InsuranceDetails` | `insurance_details` (policy X-dates) |
| `AppointmentMaster`, `AppointmentStatus` | `appointments`, `appointment_statuses` |
| `AgencyMaster` | `agencies` (the "Insurance Companies" screen) |
| `tblCallRecord` | `call_records` (+ QA scoring) |
| `FeedbackMaster`, `FBStatusMaster` | `feedback`, `fb_statuses` |
| `BulletinBoard` | `bulletin_board` |
| `AEIDoc` | `documents` |
| `tbl_FileImport` | `import_batches` |
| `tblIPAddress` | `ip_whitelist` |
| `MailAlert` (VB module) | `alert_rules`, `alert_log` |

## Security model

Four roles, enforced in the database rather than the UI:

- **admin** — full access, including user administration and IP lockdown
- **manager** — all accounts, leads, appointments, projects and imports
- **agent** — leads, appointments, QA and the bulletin board
- **client** — read-only, and only rows belonging to their own company

Every table has RLS enabled. The navigation hides what a role cannot use, but
the policies are what actually deny access — `npm run test:integration` proves
it. A disabled account, and a session that has not yet entered its two-factor
code, see nothing at all.

## Deploying to Vercel

The app needs a **hosted** Supabase project — the local Docker stack is not
reachable from Vercel. Without one, every route shows a setup screen at
`/setup` explaining what is missing (rather than a 500).

1. **Create the Supabase project** at [supabase.com/dashboard](https://supabase.com/dashboard).
   Under *Settings → API* copy the **Project URL** and the **anon / publishable** key.

2. **Push the schema and seed data.** Either paste `supabase/deploy.sql`
   (migrations + seed in one file) into the dashboard's **SQL Editor** and run
   it — no CLI or credentials needed — or use the CLI:

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npm run db:push          # runs the migrations, then supabase/seed.sql
   ```

   Regenerate `deploy.sql` after changing a migration: `npm run db:bundle`.
   A project that is already set up only needs the migrations it has not run.

   This creates the tables, RLS policies, lookup values and the demo accounts
   (`admin@beacon.test` etc., password `Beacon!2026`).

3. **Set the environment variables** in Vercel → *Project → Settings →
   Environment Variables*, for Production (and Preview if you use it):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon or publishable key>
   SUPABASE_SERVICE_ROLE_KEY=<service role key>    # server only, never NEXT_PUBLIC_
   ```

   These are inlined at **build** time, so saving them is not enough —
   **trigger a new deployment** afterwards (Deployments → ⋯ → Redeploy).

4. **Configure Supabase Auth**: turn off public sign-ups; set the Site URL and
   add `https://<your-domain>/auth/callback` to the Redirect URLs; and set up
   custom SMTP, or invitation emails only reach your Supabase team members.

5. **Add your production users** from the app's *Users & Access* screen,
   signed in as an admin. Each person gets an email to set their password.

### Why it 500'd before

`src/proxy.js` runs on every request and used to create the Supabase client
unconditionally. With the variables unset it threw before any page rendered,
so even `/login` returned 500. It now checks configuration first and sends
visitors to `/setup`; it also detects a `127.0.0.1` URL on a hosted deployment,
which is what happens when `.env.local` values are pasted into Vercel.
