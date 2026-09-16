# Beacon CRM

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

`npm run db:start` prints the local API URL and keys. They are already written to
`.env.local`; if the values differ, update:

```
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=<publishable key>
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
| `npm run db:start` / `db:stop` | Start / stop the local Supabase stack |
| `npm run db:reset` | Drop, re-run migrations, re-seed |
| `npm run smoke` | Sign in as each role and assert RLS exposes the right rows |
| `npm run db:studio` | Print the Supabase Studio URL (http://127.0.0.1:54323) |

## Project layout

```
app/                 route per module (leads, appointments, clients, …)
components/          UI and record forms
  ui/                shadcn primitives
lib/
  queries.js         server-side reads   (all data fetching)
  actions.js         server actions      (all writes)
  supabase/          browser + server clients
  display.js         formatting helpers
  constants.js       status → colour maps
proxy.js             session refresh + route protection (Next 16 renamed
                     middleware.js → proxy.js)
supabase/
  migrations/        schema + RLS policies
  seed.sql           lookups, demo accounts, sample records
scripts/smoke-test.mjs
```

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
the policies are what actually deny access — `npm run smoke` proves it.

## Deploying to Vercel

The app needs a **hosted** Supabase project — the local Docker stack is not
reachable from Vercel. Without one, every route shows a setup screen at
`/setup` explaining what is missing (rather than a 500).

1. **Create the Supabase project** at [supabase.com/dashboard](https://supabase.com/dashboard).
   Under *Settings → API* copy the **Project URL** and the **anon / publishable** key.

2. **Push the schema and seed data** from this repo:

   ```bash
   npx supabase login
   npx supabase link --project-ref <your-project-ref>
   npm run db:push          # runs the migrations, then supabase/seed.sql
   ```

   This creates the tables, RLS policies, lookup values and the demo accounts
   (`admin@beacon.test` etc., password `Beacon!2026`).

3. **Set the environment variables** in Vercel → *Project → Settings →
   Environment Variables*, for Production (and Preview if you use it):

   ```
   NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=<anon or publishable key>
   ```

   These are inlined at **build** time, so saving them is not enough —
   **trigger a new deployment** afterwards (Deployments → ⋯ → Redeploy).

4. **Add your production users.** Create them under *Authentication → Users*
   in Supabase, then insert a matching row in `public.users` with the right
   `role` and `auth_id`, or invite them from the app's Users screen once you
   are signed in as an admin.

### Why it 500'd before

`proxy.js` runs on every request and used to create the Supabase client
unconditionally. With the variables unset it threw before any page rendered,
so even `/login` returned 500. It now checks configuration first and sends
visitors to `/setup`; it also detects a `127.0.0.1` URL on a hosted deployment,
which is what happens when `.env.local` values are pasted into Vercel.
