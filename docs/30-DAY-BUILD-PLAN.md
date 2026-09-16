# Beacon CRM — 30-Day Build Plan

**Document type:** Execution plan (day-by-day)  
**Prepared:** August 29, 2026  
**Baseline:** Beacon Requirements Specification (FR-AUTH … FR-ADM, Aug 22, 2026)  
**Codebases:** `BeaconApp` (legacy VB.NET / ASP.NET Web Forms / SQL Server) → `beacon-crm` (Next.js + Supabase)  
**Hard requirements by Day 30:** full functional parity with BeaconApp · seamless integration with existing data · **zero data loss** · competitive differentiators shipped  

---

## 0. How to use this document

This plan is written so a developer who has never seen Beacon can finish the rebuild by following it alone.

| Rule | Meaning |
|------|---------|
| One source of truth | Functional behavior = Requirements Spec FR-IDs. This plan maps every FR-ID to build days. |
| Design preview is the UI shell | `beacon-crm` already has routes and mock UI for every module. Days 1–30 replace `lib/data.js` with live Supabase data and wire real mutations. |
| Legacy stays live | Do not shut down BeaconApp until Day 30 cutover checklist passes. |
| Zero-loss gate | No module is “done” until row counts, checksums, and spot-checks match the legacy copy for that domain. |
| Definition of done (daily) | Tasks listed under **Done when** must all be true before starting the next day. |

### Prerequisites (before Day 1)

1. Access to legacy SQL Server (read-only production copy + writable staging clone).
2. Supabase project (or local Supabase CLI) with Owner role.
3. Node 20+, npm, Git, and ability to run `beacon-crm` (`npm run dev`).
4. SMTP / transactional email provider credentials (Resend, Postmark, or Microsoft Graph — **not** hardcoded SMTP passwords).
5. Copy of: Requirements Spec PDF, Analysis Report, Proposal B, this plan, and the `BeaconApp` source tree.
6. Stakeholder contact for UAT (admin, account manager, client user).

### Repository layout after Day 1

```
beacon-crm/
  app/                  # Next.js App Router pages (already scaffolded)
  components/           # UI shell (already scaffolded)
  lib/
    data.js             # REMOVE usage gradually; keep only helpers
    supabase/           # NEW: browser + server clients
    db/                 # NEW: typed query helpers
    email/              # NEW: templates + send queue
    migration/          # NEW: ETL scripts & checksums
  supabase/
    migrations/         # SQL migrations (schema + RLS)
    seed/               # anonymized sample for local
  docs/
    30-DAY-BUILD-PLAN.md
    FR-TRACEABILITY.md  # generated Day 1
    SCHEMA-MAP.md       # generated Day 2
```

---

## 1. Current state (truth)

| Area | Status today |
|------|----------------|
| `beacon-crm` UI | Design preview: all primary routes exist; interactive filters/toasts; **sample data only** (`lib/data.js`). |
| Supabase | Placeholder client (`lib/supabaseClient.js` exports `null`). |
| Auth | Login page is visual only; no Supabase Auth. |
| Database | No production schema in repo; legacy lives on SQL Server 2008 via DCMPowerDAL. |
| Email | Legacy `MailAlert.vb` (Office 365 SMTP + HTTP-fetched lead sheet body). |
| Requirements | Fully enumerated in Requirements Spec (FR-AUTH through FR-ADM). |

**Conclusion:** Days 1–30 are not “design from scratch.” They are: schema + auth + wire every screen to real data + parity behaviors + migration + differentiators + cutover.

---

## 2. Success criteria (Day 30 gate)

### 2.1 Functional parity

Every FR-ID in the Requirements Spec is implemented and verified (see §8 traceability). Role landings match Section 3 of the Spec:

| User type | Landing |
|-----------|---------|
| Administrator (Type 1) | Projects / Dashboard workspace |
| Account/Agency staff (Type 2) | Agency (AEI) projects / lead-gen workspace |
| Program user (Type 3) | Program area |
| Client / Feedback admin (Type 4) | Client feedback + client calendar / delivered leads |

### 2.2 Zero data loss

- Full export of legacy tables retained as immutable backup (timestamped).
- Staging migration: row counts match ±0 for every migrated table.
- Checksums (hash of business keys + critical columns) match for clients, projects, leads, appointments, users.
- Spot-check: 25 random leads, 10 appointments, 10 clients — field-level match.
- Documents/logos: file count and byte size match; openable from new Storage.
- Dual-run window (Days 27–29): no orphan writes; delta sync catches late legacy activity.

### 2.3 Non-functional (from Analysis Report — solved by rebuild)

- No secrets in source; env-only credentials.
- Hashed passwords / reset links (not “email me my password”).
- HTTPS; parameterized queries (Postgres via Supabase).
- Email failures visible (queue + admin alert).
- In-process lead-sheet HTML (no WebClient fetch of internal ASPX).

### 2.4 Differentiators shipped (minimum set)

See §4. Must ship at least: **X-Date Command Center**, **Alert Reliability Hub**, **Client Delivery Portal (v1)**, **global search**, **audit trail**, **calendar export (ICS)**.

---

## 3. Competitive landscape & gap analysis

Beacon is **not** a full Agency Management System (AMS). It is a **B2B lead-generation and appointment-setting CRM** run by a marketing agency for insurance-agency clients. Competitors below are compared for *adjacent* capabilities staff will expect in 2026.

### 3.1 Platforms researched

| Platform | Primary focus | Relevance to Beacon |
|----------|---------------|---------------------|
| **AgencyBloc** | Life/health AMS: commissions, policies, renewals | Client agencies may use it; Beacon feeds them *leads*, not policies |
| **HawkSoft** | P&C AMS: carrier download, ACORD forms | Same — AMS neighbor, not peer product |
| **AgencyZoom** | Insurance sales pipeline + automation on top of AMS | Closest *sales* competitor mindset |
| **Salesforce Financial Services Cloud** | Enterprise CRM + insurance data model | Overkill; proves need for audit, pipelines, mobile |
| **SalesRabbit** | Field canvassing, appointment routing, calendar sync | Appointment UX & mobile expectations |
| **Velocify** | High-velocity lead distribution & scoring | Lead routing / SLA patterns |

### 3.2 Features competitors have that Beacon (legacy + current preview) lacks

| # | Competitor capability | Gap in Beacon today | Plan response |
|---|----------------------|---------------------|---------------|
| G1 | Real-time / live dashboards | Static pages; no live counters | Day 22–23 dashboard + Realtime subscriptions |
| G2 | Mobile-first field UX | Desktop Web Forms; preview is responsive but not production | Days 3–4 harden mobile; Day 25 polish |
| G3 | Google / Outlook calendar sync | Internal calendar only | Day 17 ICS export + optional OAuth sync scaffold |
| G4 | MFA / SSO | Username/password + IP lockdown only | Day 5 Supabase Auth MFA optional; keep IP allow-list |
| G5 | Activity / audit trail | Little who-changed-what | Day 6 `audit_events` + UI on Day 26 |
| G6 | Lead scoring / SLA timers | Manual call results only | Day 12 X-Date urgency score + SLA clocks |
| G7 | Client self-service portal | Limited client feedback/calendar areas | Day 24 Client Delivery Portal |
| G8 | SMS / multi-channel alerts | Email only | Day 20 email primary; SMS optional stub |
| G9 | Drip / follow-up automation | Rule-based one-shot email | Day 20 alert rules + digest; Day 26 nurture light |
| G10 | Show-rate & ROI analytics | Basic reports | Day 22–23 reports + client-facing metrics |
| G11 | Global search | Per-page search only | Day 25 command palette search |
| G12 | Public API / webhooks | None | Day 26 webhook on lead delivered |
| G13 | Failed-delivery monitoring | Silent email failures (known outage) | Day 19–20 Alert Reliability Hub |
| G14 | Visual pipeline / Kanban | List-centric | Day 13 optional lead board by call result |

### 3.3 Unique Beacon differentiators (build these — do not become a generic AMS)

These are features competitors either lack or do not tailor to **agency-of-record lead delivery for insurance X-dates**:

1. **X-Date Command Center** — Cross-client heatmap of upcoming policy renewals; prioritize “hot” by days-to-X-date and carrier; one-click filters into lead queue.
2. **Lead Sheet Studio** — Branded, printable lead sheets rendered server-side from templates (HTML → email + PDF); replaces fragile ASPX HTTP fetch.
3. **Alert Reliability Hub** — Durable send queue, retries, delivery status, admin pager on failure rate; end of silent outages.
4. **Call-Result Rule Engine (visible)** — DBDV vs APPT rules editable with live “who gets notified?” preview (parity with `MailAlert.vb` logic, made transparent).
5. **Client Delivery Portal** — White-labeled view for Type-4 users: delivered leads, appointments, feedback, show-rate — the product clients *feel*.
6. **Dual-Run Cutover Console** — Migration checksums, delta sync, FR parity checklist — operational excellence as a product feature during transition.
7. **Rep Coaching Loop** — QA scores joined to call-result mix and appointment show outcomes for coaching, not vanity scores.
8. **Parity Guarantee Mode** — In-app FR checklist for admins during pilot (builds trust with stakeholders who have used Beacon for ~20 years).

---

## 4. Target architecture

| Layer | Choice | Notes |
|-------|--------|-------|
| UI | Next.js 16 App Router (existing `beacon-crm`) | Keep design system; wire data |
| Auth | Supabase Auth | Map legacy user types → `app_metadata.role` / `profiles.user_type` |
| DB | Supabase Postgres | RLS per role/client scope |
| Files | Supabase Storage | `documents`, `logos`, `imports` buckets |
| Email | Resend or Postmark (or Graph) | Queue table + Edge Function or Next route workers |
| Hosting | Vercel (app) + Supabase (data) | HTTPS by default |
| Migration | Node ETL scripts in `lib/migration` | Read SQL Server → transform → upsert Postgres |

### 4.1 Role model (map Spec §3 → app)

| Spec type | `profiles.user_type` | Nav roles in `lib/nav.js` |
|-----------|----------------------|---------------------------|
| Type 1 Administrator | `admin` | `admin` |
| Type 2 Account/Agency | `manager` or `agent` | `manager` / `agent` |
| Type 3 Program | `program` | extend nav Day 5 |
| Type 4 Client/Feedback | `client` | `client` |

Preserve **IP lockdown** as optional allow-list on `profiles.allowed_ips` checked in middleware (FR-AUTH-03).

### 4.2 Call-result → email rules (must preserve exactly)

From legacy `MailAlert.vb` (parity source):

**DBDV (project type 1)** — send when call result is one of:  
`Phone Appointment`, `Survey Appointment`, `X-Date-Lead`, `X-Date-Profile`, `X-Date Hot Lead`  
(also when forced reprocess / OnlyEmail).

**APPT (project type 2)** — send when call result is one of:  
`Appt From X-Date`, `Phone Appointment`.

**Body rules:** If project email starts with `_`, send link-only body to address without underscore; else HTML lead sheet to `ProjectEmail`.

Implement these as data-driven rules in `alert_rules` seeded to match legacy, with UI to view (edit only with admin + audit).

---

## 5. Data migration strategy (zero loss)

### 5.1 Principles

1. **Never migrate from production alone** — always from a frozen backup snapshot + final delta.
2. **Idempotent upserts** — every row has stable `legacy_id` (original PK) so re-runs do not duplicate.
3. **Preserve history** — soft-deletes and inactive clients stay; do not “cleanse away” rows.
4. **Files are data** — logos and lead documents migrate with path map table.
5. **Passwords** — do **not** copy recoverable passwords. Invite users to set new passwords (or one-time import hash if already hashed — they are not). Communicate Day 5.

### 5.2 Phased ETL

| Phase | Tables (illustrative legacy names) | Days |
|-------|-------------------------------------|------|
| A | Reference: insurance companies, statuses, call results | 2, 7 |
| B | Users → profiles (no passwords), IP lists | 5, 7 |
| C | Clients, client profiles, account managers | 8–9 |
| D | Projects, project emails, AE assignments | 10 |
| E | Leads + X-dates + call results | 11–13 |
| F | Appointments | 15–16 |
| G | Feedback, QA, bulletin | 21, 24 |
| H | Documents / logos → Storage | 18 |
| I | Import history metadata | 18 |
| J | Final delta + cutover freeze | 27–29 |

Exact table/column map is produced on **Day 2** into `docs/SCHEMA-MAP.md` by introspecting SQL Server (`INFORMATION_SCHEMA`). Known entities from source: `LeadMaster`, `ProjectMaster`, `UserMaster`, `InsuranceCompany`, DCMPowerDAL classes.

### 5.3 Verification protocol (run after every phase)

```bash
# Pseudocode — implement Day 2
npm run migrate:verify -- --domain=leads
# Prints: legacy_count, supabase_count, missing_ids[], extra_ids[], field_mismatch_sample[]
```

Gate: `missing_ids` and `extra_ids` empty; field mismatches investigated and zeroed for critical fields.

### 5.4 Rollback

- Keep legacy BeaconApp read/write until Day 30 sign-off.
- Supabase daily backups enabled Day 1.
- Migration scripts never `TRUNCATE` without explicit `--i-know` flag.

---

## 6. Week overview

| Week | Days | Theme | Milestone |
|------|------|-------|-----------|
| 1 | 1–7 | Foundation, schema, auth, migration harness | M1: login works against Supabase; empty schema live; ETL dry-run |
| 2 | 8–14 | Clients, projects, carriers, AMs, leads core | M2: lead CRUD + filters + lead sheet preview on real data |
| 3 | 15–21 | Appointments, calendar, email/alerts, docs, imports | M3: qualifying lead triggers email via queue; files in Storage |
| 4 | 22–28 | Reports, feedback, QA, bulletin, admin, differentiators | M4: FR parity checklist ≥95%; differentiators demoable |
| Close | 29–30 | Dual-run, UAT, cutover, hypercare | M5: production cutover; zero-loss certificate |

---

## 7. Day-by-day schedule

Each day assumes ~1 focused builder day. Adjust calendar dates but keep sequence.

---

### DAY 1 — Orient, inventory, project hygiene

**Goal:** Anyone new can run the app and knows exactly what exists.

**Morning**
1. Clone/pull `beacon-crm`; run `npm install` && `npm run dev`; open every sidebar route; note what is mock vs interactive.
2. Skim Requirements Spec §§1–21; print FR list into `docs/FR-TRACEABILITY.md` (columns: FR-ID, title, day, status, test note).
3. Skim Analysis Report critical findings (secrets, plaintext failed logins, HTTP body fetch) — these become non-negotiable rebuild constraints.
4. Inventory BeaconApp folders vs Spec modules (AIClients, DCILeads, AlertEngine, etc.) — attach paths in FR-TRACEABILITY “legacy path” column.

**Afternoon**
5. Create Supabase project; save URL + anon + service role into `.env.local` (never commit). Enable PITR/backups.
6. Install `@supabase/supabase-js`, `@supabase/ssr`; replace placeholder in `lib/supabaseClient.js` with browser client; add `lib/supabase/server.js` and `lib/supabase/middleware.js`.
7. Add `.env.example` documenting required keys (no secrets).
8. Commit structure: `supabase/migrations/.gitkeep`, `docs/`.

**Done when**
- Dev server runs; env loads; FR-TRACEABILITY skeleton exists with all FR-IDs listed as `todo`.
- README updated: “Design preview → production build in progress; see docs/30-DAY-BUILD-PLAN.md”.

**FR touched:** none implemented yet (planning).

---

### DAY 2 — Legacy schema discovery & SCHEMA-MAP

**Goal:** Complete field-level map from SQL Server → Postgres without guessing.

**Tasks**
1. Connect read-only to legacy DB (or restored backup). Export `INFORMATION_SCHEMA.TABLES` / `COLUMNS` / FKs to `docs/legacy-schema.json`.
2. Identify primary entities and row counts: users, clients, projects, leads, appointments, insurance companies, documents metadata, feedback, QA, bulletin, import logs.
3. Write `docs/SCHEMA-MAP.md`: for each entity — legacy table, PK, critical columns, transforms, target Postgres table, notes (e.g. call result columns `CALLRESULT_DBDV` / `CALLRESULT_APPT`).
4. Draft Postgres DDL in `supabase/migrations/20260829_001_init.sql` covering core tables (create empty; refine Days 3–4):  
   `profiles`, `clients`, `client_profiles`, `account_managers`, `insurance_companies`, `projects`, `leads`, `appointments`, `documents`, `feedback`, `qa_reviews`, `bulletin_posts`, `imports`, `alert_rules`, `alert_jobs`, `audit_events`, `ip_allowlist` (or column on profiles).
5. Add `legacy_id` (text/bigint) + `legacy_source` on every migrated table; unique index `(legacy_source, legacy_id)`.
6. Scaffold `npm run migrate:introspect` script.

**Done when**
- SCHEMA-MAP covers every Spec module’s data.
- Init migration applies cleanly on empty Supabase (`supabase db push` or SQL editor).
- Row-count baseline spreadsheet saved (`docs/migration-baseline.csv`).

**FR touched:** data foundation for all modules.

---

### DAY 3 — Postgres schema v1 + RLS skeleton + design tokens check

**Goal:** Secure-by-default schema; UI still on mock data but DB ready.

**Tasks**
1. Finalize columns for clients, projects, leads, appointments from SCHEMA-MAP (match Spec fields: company, contact, phone, location, X-date, delivery emails, project type DBDV/APPT, status).
2. Enable RLS on all tables; policies stub: `admin` full access; others deny until Day 5 (safer default).
3. Create enums/check constraints for project_type (`DBDV`,`APPT`), lead call results (full Spec lists), appointment confirmation statuses.
4. Storage buckets: `logos`, `documents`, `imports` — private; signed URLs only.
5. Confirm UI design system still builds (`npm run build`); fix any App Router issues early.
6. Add health route `app/api/health/route.js` returning `{ ok: true, db: ... }`.

**Done when**
- Migration applies; RLS enabled; health check green.
- No table is publicly readable with anon key alone.

**FR:** FR-ADM-03 (settings placeholder), non-functional security.

---

### DAY 4 — Shared data access layer & replace mock on Dashboard only

**Goal:** Establish the pattern every later page will copy.

**Tasks**
1. Create `lib/db/clients.ts` (or `.js`) helpers: `listClients`, `getClient`, etc. using server Supabase client.
2. Create React Server Components or loaders pattern consistent with existing pages (many are `"use client"` — prefer: server page fetches, client island for filters).
3. Wire **Dashboard** (`app/page.js`) to live aggregate queries (may be empty counts). Keep mock fallback only if `USE_MOCK_DATA=true`.
4. Add empty states (“No clients yet — run migration phase C”).
5. Write unit-less but practical smoke script: `npm run smoke` hits health + dashboard.

**Done when**
- Dashboard reads from Supabase; toggable mock for demos.
- Documented pattern in `docs/DATA-ACCESS.md` (½ page).

**FR:** dashboard support for FR-RPT metrics later.

---

### DAY 5 — Authentication, sessions, role routing, IP lockdown

**Goal:** FR-AUTH-01…06 modernized.

**Tasks**
1. Implement login page against Supabase email/password (or username mapped via profiles.email).
2. Middleware: protect all routes except `/login`, `/auth/callback`, `/api/health`.
3. On success, route by `user_type` (Spec §3 landings) — FR-AUTH-02.
4. IP lockdown: middleware compares request IP to `profiles.allowed_ips` (CIDR or exact); refuse with clear message — FR-AUTH-03.
5. Failed login audit table `auth_failures` storing **username, IP, timestamp only** (never password) — FR-AUTH-04 modernization.
6. Session via Supabase cookies — FR-AUTH-05.
7. Password recovery: Supabase reset link email — FR-AUTH-06 modernization (do **not** email plaintext password).
8. Seed one admin user manually; document invite flow.
9. Map role provider (`components/role-provider.jsx`) to real session claims.

**Done when**
- Can log in/out; wrong IP blocked (test with allow-list); reset email sends in staging.
- FR-AUTH-* marked `done` in FR-TRACEABILITY with test notes.

**FR:** FR-AUTH-01 … FR-AUTH-06.

---

### DAY 6 — Users admin, branding settings, audit_events

**Goal:** FR-ADM-01/02 foundation + audit.

**Tasks**
1. Users page (`app/users/page.js`): list profiles; invite user; set role; set IP allow-list; activate/deactivate — FR-ADM-02.
2. Settings page: company/product name, logo upload to Storage — FR-ADM-01; mail from-name / from-address config in `app_settings` table — FR-ADM-03.
3. Implement `audit_events` writer helper `logAudit({ actor, action, entity, entity_id, before, after })`; call from user update + settings update.
4. Program / Meet-the-team stub routes if missing (FR-ADM-04) — content pages OK for now.

**Done when**
- Admin can invite a manager; logo appears in shell; audit row written.

**FR:** FR-ADM-01, FR-ADM-02, FR-ADM-03 (partial), FR-ADM-04 (stub).

---

### DAY 7 — Migration harness + Phase A/B dry-run

**Goal:** Repeatable ETL with checksums.

**Tasks**
1. Implement `lib/migration/mssql.js` (tedious/mssql package) read-only connection.
2. Implement `lib/migration/upsert.js` generic upsert by `legacy_id`.
3. Scripts: `migrate:phase-a` (insurance companies + reference), `migrate:phase-b` (users → profiles without passwords; mark `must_reset_password`).
4. `migrate:verify --domain=insurance|users` comparing counts and ID sets.
5. Run against **staging** clone; fix mapping bugs.
6. Document operator runbook: order of phases, env vars, `--dry-run`.

**Done when**
- Phase A/B dry-run report attached to `docs/migration-runs/YYYYMMDD-phase-ab.md` with zero missing IDs.
- Passwords not migrated.

**FR:** supports all; FR-INS reference data; FR-ADM-02 users.

---

### DAY 8 — Clients module (list + CRUD)

**Goal:** FR-CLI-01, FR-CLI-04.

**Tasks**
1. Replace mock on `app/clients/page.js` with live list: search, active filter, lead/appt volume aggregates.
2. Add create/edit drawer or `/clients/new` + edit on `[slug]` — company name, location, contacts, active flag.
3. Soft-deactivate (never hard-delete migrated clients).
4. Migration Phase C (clients) + verify.
5. Wire client detail `[slug]/page.js` to real record.

**Done when**
- CRUD works; migrated clients visible; volumes accurate vs SQL for sample of 10.

**FR:** FR-CLI-01, FR-CLI-04.

---

### DAY 9 — Client profiles, delivery emails, AM assignment

**Goal:** FR-CLI-02, FR-CLI-03, FR-CLI-05.

**Tasks**
1. Client profile fields: preferences, territory, delivery settings.
2. Multi-email delivery addresses (array or child table `client_delivery_emails` / project-level emails per Spec — project email is primary in legacy; support both client-level and project-level).
3. Assign account manager (FK).
4. Associate projects list on client detail.
5. Extend migration Phase C for profile columns.

**Done when**
- Editing profile persists; AM shows on client list; delivery emails saved.

**FR:** FR-CLI-02, FR-CLI-03, FR-CLI-05.

---

### DAY 10 — Projects module (DBDV / APPT)

**Goal:** FR-PRJ-01 … FR-PRJ-05.

**Tasks**
1. Live `app/projects/page.js` + `[id]/page.js`.
2. Create/edit project: client, manager, type DBDV|APPT, status active/paused/draft, delivery email, settings.
3. Lead counts per project.
4. Separate nav/workspace cues for admin vs agency (AEI) users — filter projects by assignment for Type 2.
5. Migration Phase D + verify.

**Done when**
- Project detail shows leads placeholder list; type drives later call-result options.

**FR:** FR-PRJ-01 … FR-PRJ-05.

---

### DAY 11 — Insurance companies + Account managers

**Goal:** FR-INS-*, FR-AM-*.

**Tasks**
1. Wire `insurance-companies` CRUD: name, lines of business, states/territories, status — FR-INS-01/02.
2. Associate carriers on lead form (prepare FK) — FR-INS-03.
3. Account managers pages: CRUD; book-of-business metrics (client count, appts/month, lead volume) — FR-AM-01/02/03.
4. Ensure leads/appointments attribution fields exist.
5. Re-verify Phase A; migrate AM records if separate from users.

**Done when**
- Both modules live; metrics match staging SQL within tolerance.

**FR:** FR-INS-01…03, FR-AM-01…03.

---

### DAY 12 — Leads core CRUD + X-Date + assignment

**Goal:** FR-LEAD-01, FR-LEAD-03, FR-LEAD-04.

**Tasks**
1. Wire `app/leads/page.js` and `app/leads/[id]/page.js` to Supabase.
2. Create/edit lead: company, contact, phone, location, project, carrier, X-date, assigned rep (nullable = unassigned).
3. Call-result dropdown **filtered by project type** (prepare options; full validation Day 13).
4. Migration Phase E (leads) batch 1 + verify.
5. Add X-Date urgency helper: `days_to_xdate` computed; badge on list (differentiator seed for Command Center).

**Done when**
- Can create lead on a migrated project; assignment works; X-date stored as date.

**FR:** FR-LEAD-01, FR-LEAD-03, FR-LEAD-04.

---

### DAY 13 — Call results, filters, reprocess, Kanban optional

**Goal:** FR-LEAD-02, FR-LEAD-05, FR-LEAD-07, FR-LEAD-08.

**Tasks**
1. Enforce call-result sets per DBDV/APPT (Spec + MailAlert lists).
2. Search/filter: status/call result, project, client, rep, date range.
3. Lead-gen status view on project detail (counts by call result) — FR-LEAD-07.
4. “Reprocess / Resend delivery” action sets flag / enqueues alert job — FR-LEAD-08 (email send Day 19–20).
5. Optional: Kanban board by call result (G14) — ship if time; else backlog with UI stub.
6. Finish lead migration + verify checksums.

**Done when**
- Filters match Spec; reprocess enqueues job row; status view correct for one DBDV and one APPT project.

**FR:** FR-LEAD-02, FR-LEAD-05, FR-LEAD-07, FR-LEAD-08.

---

### DAY 14 — Lead Sheet Studio (print + email body source)

**Goal:** FR-LEAD-06 (+ modernization of email body).

**Tasks**
1. Build server-rendered lead sheet template (`lib/email/lead-sheet.jsx` or HTML template) including branding logo, lead fields, call result, X-date.
2. Print route or print CSS on lead detail (reuse `components/print-button.jsx`).
3. Generate HTML string in-process for email (no HTTP fetch to ASPX).
4. PDF optional via `@react-pdf/renderer` or headless — nice-to-have; HTML print acceptable for parity.
5. Side-by-side compare 5 legacy printed sheets vs new (stakeholder).

**Done when**
- Printable sheet approved for layout parity; HTML captured for mailer.

**FR:** FR-LEAD-06.

**Week 2 milestone M2 checkpoint:** core lead path usable on staging data.

---

### DAY 15 — Appointments CRUD + alerts hook points

**Goal:** FR-APPT-01 … FR-APPT-04 (alert send later).

**Tasks**
1. Wire appointments list; create from lead (date, time, duration, type, client contact).
2. Status: scheduled vs awaiting confirmation — FR-APPT-03.
3. List by day/week with rep — FR-APPT-02.
4. On create/update, insert `alert_jobs` of type `appointment_set` — FR-APPT-04 (processor Day 20).
5. Migration Phase F + verify.

**Done when**
- Appointment create from lead works; shows in list; job row created.

**FR:** FR-APPT-01…04 (send pending).

---

### DAY 16 — Calendar views (month, agenda, client)

**Goal:** FR-CAL-01 … FR-CAL-03.

**Tasks**
1. Monthly calendar with indicators — FR-CAL-01.
2. Agenda for “today” — FR-CAL-03.
3. Client-facing calendar filtered to that client’s appointments — FR-CAL-02 (role `client`).
4. Mobile layout check.

**Done when**
- Three views work on real appointment data; client user only sees own.

**FR:** FR-CAL-01…03.

---

### DAY 17 — Calendar export + availability polish (differentiator / G3)

**Goal:** Close competitor gap on calendar portability.

**Tasks**
1. ICS export per user and per client (`text/calendar` download).
2. Optional: document OAuth Google/Outlook sync as Phase-2; ship “Copy ICS feed URL” if feasible with signed token.
3. Round-robin assignment helper for unassigned appointments (SalesRabbit-like; keep simple).

**Done when**
- ICS imports cleanly into Google Calendar for a test week.

**FR:** enhances FR-CAL-*; differentiator.

---

### DAY 18 — Documents, logos, imports

**Goal:** FR-DOC-*, FR-IMP-*.

**Tasks**
1. Upload to Storage; attach to lead/client/project — FR-DOC-01.
2. Logo management for branding/lead sheets — FR-DOC-02.
3. List with type, owner, size, date; open/delete — FR-DOC-03.
4. Resource templates metadata — FR-DOC-04.
5. CSV import wizard for leads into a project: validate headers, row preview, job status Complete/Processing/Failed — FR-IMP-01/02.
6. Import history page — FR-IMP-03.
7. Migration Phase H/I for existing files (scripted upload from legacy file store paths).

**Done when**
- Upload/download works; sample CSV import creates leads; history retained.

**FR:** FR-DOC-01…04, FR-IMP-01…03.

---

### DAY 19 — Alert Reliability Hub (queue infrastructure)

**Goal:** FR-ALERT-05/06 foundation; kill silent failures.

**Tasks**
1. Tables: `alert_jobs` (pending/processing/sent/failed), `alert_attempts`, `alert_rules`.
2. Worker: Next.js route secured by cron secret **or** Supabase Edge Function draining queue.
3. Record every attempt + error — FR-ALERT-05.
4. Admin UI on `app/alerts/page.js`: recent fires, failures, toggle rules — FR-ALERT-06.
5. Threshold alert: if failure rate > N in window, email admins (meta-alert).
6. Seed rules matching MailAlert DBDV/APPT logic — FR-ALERT-03.

**Done when**
- Manually enqueued job sends a test email; failure path visible in UI.

**FR:** FR-ALERT-03, FR-ALERT-05, FR-ALERT-06.

---

### DAY 20 — Lead & appointment email delivery (parity)

**Goal:** FR-ALERT-01…04.

**Tasks**
1. On qualifying call-result save, enqueue lead delivery with HTML from Lead Sheet Studio — FR-ALERT-01, FR-ALERT-04.
2. Appointment-status notifications to staff — FR-ALERT-02.
3. Honor `_` prefix link-only body rule — FR-ALERT-04.
4. Reprocess action from Day 13 now fully sends.
5. Configure production mail domain SPF/DKIM.
6. Optional SMS stub interface (G8) — log “would send” if no provider.

**Done when**
- End-to-end: set call result on staging lead → client inbox receives sheet within 2 minutes.
- Compare subject lines to legacy format: `{CallResult}-{CompanyName}`.

**FR:** FR-ALERT-01…04.

**Week 3 milestone M3 checkpoint.**

---

### DAY 21 — Feedback, QA, Bulletin Board

**Goal:** FR-FB-*, FR-QA-*, FR-BB-*.

**Tasks**
1. Client feedback submit (rating + text) — FR-FB-01; admin list by client/date — FR-FB-02; summary metrics — FR-FB-03.
2. QA reviews: score, outcome passed/review/failed, by rep/client — FR-QA-01…03.
3. Bulletin: post + reverse-chronological list — FR-BB-01/02.
4. Migrate Phase G historical rows if present.
5. Start **Rep Coaching Loop** view: QA avg vs call-result mix (differentiator v1).

**Done when**
- Client role can submit feedback; admin sees summary; QA list works; bulletin posts.

**FR:** FR-FB-01…03, FR-QA-01…03, FR-BB-01/02.

---

### DAY 22 — Reports & charts core

**Goal:** FR-RPT-01…03.

**Tasks**
1. Metrics: leads delivered, appointments set, response time, show rate — selectable periods — FR-RPT-01.
2. Production by rep and by client/project — FR-RPT-02.
3. Charts (use lightweight lib e.g. Recharts) — FR-RPT-03.
4. Client-scoped report for Type 4 (only their data).

**Done when**
- Numbers reconcile with SQL queries for last 30 days on staging (±1% or explained).

**FR:** FR-RPT-01…03.

---

### DAY 23 — Report export + live dashboard + X-Date Command Center

**Goal:** FR-RPT-04 + differentiators G1 / X-Date CC.

**Tasks**
1. CSV export for each report — FR-RPT-04.
2. Dashboard live widgets via Supabase Realtime or polling (30s).
3. **X-Date Command Center** page or dashboard panel: next 30/60/90 days renewals; filter by client/carrier; click-through to leads.
4. SLA clocks: time-to-delivery, time-to-feedback (G6).

**Done when**
- CSV downloads; Command Center demoable on migrated X-dates.

**FR:** FR-RPT-04; differentiators.

---

### DAY 24 — Client Delivery Portal (differentiator)

**Goal:** Client-facing experience that competitors’ AMS tools don’t specialize in for *vendor-delivered leads*.

**Tasks**
1. Client home: delivered leads (read-only lead sheets), upcoming appointments, feedback CTA, show-rate summary.
2. White-label: client logo + agency branding.
3. Ensure RLS: client users only see their `client_id`.
4. Deep links from delivery emails into portal (signed magic links optional).

**Done when**
- Stakeholder client login walkthrough signed off.

**FR:** strengthens FR-CLI, FR-FB, FR-CAL-02, FR-LEAD-06 delivery experience.

---

### DAY 25 — Global search, mobile polish, accessibility pass

**Goal:** G2, G11.

**Tasks**
1. Command palette (⌘K): search leads, clients, projects, appointments.
2. Mobile QA on every primary flow (login → lead update → calendar).
3. Fix tap targets, sheets vs dialogs, table horizontal scroll.
4. Basic a11y: labels, focus states, contrast.

**Done when**
- Search finds known records; mobile checklist green.

---

### DAY 26 — Webhooks, audit UI, light nurture, Parity Console

**Goal:** G5, G9, G12 + differentiators.

**Tasks**
1. Webhook endpoint config: POST on `lead.delivered` / `appointment.set` to customer URL (HMAC secret).
2. Audit log viewer for admins (filter by entity).
3. Light nurture: optional “daily digest” rule (already in mock `alertRules`) — implement send.
4. **Parity Guarantee Console**: read FR-TRACEABILITY statuses; show % complete; link to modules.
5. **Dual-Run Cutover Console** scaffold: show last verify timestamps, counts.

**Done when**
- Webhook received by webhook.site; parity console shows live %.

---

### DAY 27 — Full FR sweep + gap fix day

**Goal:** Every FR-ID either `done` or explicitly `waived` with written reason.

**Tasks**
1. Walk FR-TRACEABILITY top to bottom; file bugs for any gap.
2. Fix highest-severity gaps (especially AUTH, LEAD, ALERT, CLI, PRJ).
3. Re-run all migration verifies; repair drift.
4. Performance pass: indexes on `leads(project_id)`, `(xdate)`, `(assigned_to)`, `appointments(starts_at)`.
5. Security pass: RLS tests for client isolation (attempt cross-client read must fail).

**Done when**
- FR checklist ≥ 95% done; remaining items scheduled Day 28 or waived.

---

### DAY 28 — UAT script, training notes, differentiator freeze

**Goal:** Stakeholder-ready.

**Tasks**
1. Write `docs/UAT-SCRIPT.md`: 40–60 steps covering each role.
2. Run UAT with admin + manager + client; log defects.
3. Fix blocker defects only; freeze feature scope.
4. Training one-pager for call-center reps (how call results trigger email).
5. Confirm email deliverability in production tenant (spam tests).

**Done when**
- UAT blockers = 0; stakeholders schedule cutover window.

**Week 4 milestone M4.**

---

### DAY 29 — Dual-run, final delta migration, dress rehearsal

**Goal:** Zero-loss proof before cutover.

**Tasks**
1. Freeze legacy writes at agreed time T0 (or enable dual-write if implemented; default = maintenance window).
2. Run full migration phases A–I on production Supabase from final snapshot.
3. Run `migrate:verify --all`; produce **Zero-Loss Certificate** markdown: counts, checksums, file totals, sign-off lines.
4. Dress rehearsal: 3 staff execute UAT on production URL against migrated data (read-only if needed).
5. DNS / custom domain / SSL check; monitoring (health check uptime).
6. Rollback plan printed: “revert DNS to legacy; Supabase remains intact.”

**Done when**
- Certificate attached; rehearsal notes show no P0 issues.

---

### DAY 30 — Cutover, hypercare, handoff

**Goal:** Production Beacon = `beacon-crm`.

**Tasks**
1. Final delta sync (rows changed since snapshot).
2. Switch users to new URL; put legacy in read-only (IIS app_offline or DB login revoke for app user).
3. Monitor `alert_jobs` and auth failures for 4–8 hours.
4. Hotfix only P0/P1.
5. Update README; archive FR-TRACEABILITY as `done`.
6. Handoff packet: env locations, runbooks (migrate, alerts, user invite), backup restore drill note.
7. Schedule Day 31–37 hypercare check-ins (not in build, but commit to them).

**Done when**
- Business operates on new system; zero-loss certificate signed; legacy available only as rollback.

**Milestone M5 — project complete.**

---

## 8. FR → Day traceability (summary)

| Module | FR IDs | Primary days |
|--------|--------|--------------|
| AUTH | FR-AUTH-01…06 | 5 |
| CLI | FR-CLI-01…05 | 8–9 |
| INS | FR-INS-01…03 | 11 |
| PRJ | FR-PRJ-01…05 | 10 |
| LEAD | FR-LEAD-01…08 | 12–14, 20 |
| APPT | FR-APPT-01…04 | 15, 20 |
| CAL | FR-CAL-01…03 | 16–17 |
| AM | FR-AM-01…03 | 11 |
| ALERT | FR-ALERT-01…06 | 19–20 |
| FB | FR-FB-01…03 | 21, 24 |
| QA | FR-QA-01…03 | 21 |
| BB | FR-BB-01…02 | 21 |
| DOC | FR-DOC-01…04 | 18 |
| IMP | FR-IMP-01…03 | 18 |
| RPT | FR-RPT-01…04 | 22–23 |
| ADM | FR-ADM-01…04 | 6, 24 |

Differentiators: Days 14, 17, 19, 23–26.

---

## 9. Testing strategy

| Layer | When | What |
|-------|------|------|
| Smoke | Daily | `npm run build`, health, login |
| Verify ETL | After each phase | count + ID set + field sample |
| RLS | Day 27 | cross-tenant negative tests |
| UAT | Day 28 | scripted role paths |
| Email | Day 20, 28 | real inbox + failure injection |
| Cutover | Day 29–30 | certificate + monitoring |

---

## 10. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Legacy schema undocumented / messy | Day 2 introspection; don’t trust names in code comments alone |
| Password migration expectations | Communicate reset invites early (Day 5–7) |
| Email deliverability | Dedicated domain + SPF/DKIM; Alert Hub visibility |
| Scope creep into full AMS (commissions, ACORD) | Explicitly out of scope; differentiators stay lead-delivery focused |
| Data drift during dual-run | Maintenance window or final delta Day 29–30 |
| 30 days too tight for one person | Keep differentiator “minimum set”; park Kanban/SMS/OAuth sync if needed |

---

## 11. Out of scope (explicit)

- Full AMS: commissions, carrier download, ACORD forms, policy servicing.
- Rewriting BeaconApp in place (Option A maintenance is separate).
- Native iOS/Android apps (responsive web is the mobile deliverable).
- Perfect pixel clone of 2000s UI (modern UX with **behavioral** parity).

---

## 12. Daily standup template (use every day)

```
Yesterday: …
Today (plan day N): …
Blocked: …
FR-IDs closing today: …
Migration verify status: …
```

---

## 13. Appendix A — Quick start commands

```bash
cd beacon-crm
cp .env.example .env.local   # fill Supabase + mail + cron secrets
npm install
npx supabase db push         # or paste migrations in SQL editor
npm run dev

# Migration examples (implemented across Days 2–7)
npm run migrate:phase-a
npm run migrate:verify -- --domain=insurance
```

## Appendix B — Lead email subject parity

`{CallResult}-{CompanyName}` (legacy MailAlert). Keep unless stakeholders approve change.

## Appendix C — Zero-Loss Certificate template

```
Date:
Snapshot ID:
Table, Legacy Count, Supabase Count, Delta, Checksum OK
...
Files: legacy_bytes=  supabase_bytes= 
Spot checks: 25 leads OK / 10 appts OK / 10 clients OK
Signed: Engineer ________  Stakeholder ________
```

---

*Prepared for the Beacon rebuild (`beacon-crm`) from the Functional Requirements Specification and Application Risk & Modernization Assessment. Follow day order; do not skip migration verification gates.*
