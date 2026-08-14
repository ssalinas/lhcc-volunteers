# LHCC Volunteers

A volunteer scheduling app for the church: manage recurring schedules (worship band, greeters,
ushers, ...) and one-off events (rummage sale, ...), let volunteers self-manage their availability
and team membership, and let admins auto-schedule volunteers fairly over a rolling 6–8 week window
with manual override.

## Stack

- **API**: Fastify + TypeScript, [Drizzle ORM](https://orm.drizzle.team/) over SQLite
  (`better-sqlite3`), [better-auth](https://www.better-auth.com/) for Google OAuth + email/password
- **Web**: React + Vite SPA, built to static files and served by the same Fastify process
- **Shared**: a `packages/shared` workspace of zod schemas used by both the API (route validation)
  and the web app (types + form validation)
- Designed to run as a single Node process on a Raspberry Pi

## Project layout

```
apps/api      Fastify backend — routes under src/modules/*, DB schema under src/db/schema
apps/web      React SPA — pages under src/routes, API hooks under src/api/hooks.ts
packages/shared   zod schemas + inferred types shared by both apps
deploy/       systemd unit for Pi deployment
```

## Local development

Requires Node 20+.

```bash
npm install
cp .env.example apps/api/.env   # then fill in BETTER_AUTH_SECRET at minimum
npm run db:generate -w apps/api # generate SQL migrations from the Drizzle schema (only needed after schema changes)
npm run db:migrate              # apply migrations, creates apps/api/data/lhcc.sqlite
npm run db:seed                 # creates the first admin (needs SEED_ADMIN_EMAIL/PASSWORD in .env)
npm run dev                     # runs the API (tsx watch) and Vite dev server together
```

The web app runs at `http://localhost:5173` (Vite proxies `/api` to the Fastify server on
`http://localhost:3000`).

Minimum required `.env` values for local dev (see `.env.example` for the full list):

```
BETTER_AUTH_SECRET=some-long-random-string
BETTER_AUTH_URL=http://localhost:3000
TRUSTED_ORIGINS=http://localhost:5173
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=changeme123
```

Google sign-in is optional locally — without `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` set, only
the email/password login form is available, which is enough to develop and test every feature.

### Useful scripts (run from the repo root)

- `npm run dev` — API + web dev servers together
- `npm run build` — builds `shared` → `web` → `api` in order (production build)
- `npm run start` — runs the production build (`node apps/api/dist/server.js`), which serves the
  built SPA itself
- `npm run typecheck` — typechecks all three workspace packages
- `npm run db:generate` / `db:migrate` / `db:seed` — Drizzle migration workflow (see above)

## How scheduling works

- Volunteers join **teams** (Greeters, Ushers, Worship Band, ...) themselves, or an admin adds them.
  There's also an auto-provisioned **"All Volunteers" system team** that always includes every active
  user (no real membership rows — see `jobs/ensureSystemTeams.ts` and `modules/scheduling/fairness.ts`)
  — assign a role to it when it can be filled by anyone rather than a specific team.
- Volunteers mark **availability per upcoming date** (a checkbox list of the next ~2 months of
  occurrence dates, not a freeform calendar) — this is what lets the app tell "said unavailable"
  apart from "hasn't responded yet"; a date with neither is treated as unavailable for scheduling.
  Admins can edit this on a volunteer's behalf from the Users page (same date-list component).
- Admins create **events** — one-off (a single date) or recurring (an RRULE + start time + timezone,
  e.g. "every Sunday at 9am"). Recurring events materialize into concrete **occurrences** up to
  `OCCURRENCE_HORIZON_WEEKS` (default 8) ahead, via a job that runs on boot and nightly. Saving an
  event shows a confirmation dialog; editing a recurring event's dialog includes a checkbox to
  regenerate future occurrences immediately (adds newly-valid dates, drops future unassigned ones
  that no longer match — never touches an occurrence with existing assignments).
- Each occurrence has **roles** (e.g. "Greeter", 2 slots, tied to a team), either copied from the
  event's role templates or added ad hoc to a single occurrence. The admin Events page lists
  upcoming occurrences with a fully-staffed/needs-volunteers badge so you can jump straight to
  scheduling one.
- **Auto-schedule** (per occurrence) fills unfilled role slots by ranking each team's available
  members by how little they've served in the last `FAIRNESS_LOOKBACK_WEEKS` (default 6) — least-
  recently/least-often-served first. A volunteer can't hold two roles in the same occurrence unless
  the role is flagged **stackable**, and even then fresh (unused-that-occurrence) volunteers are
  preferred first. It's idempotent — safe to re-run after manual edits, it only fills gaps.
- Admins can override any assignment by hand from the occurrence detail screen, including adding
  volunteers beyond a role's normal slot count when extra coverage is wanted.

## Deploying to a Raspberry Pi

1. **Get the code onto the Pi and install dependencies.** `better-sqlite3` is a native module —
   run `npm install` *on the Pi itself* (ARM), not on your dev machine, so the binary matches.
   ```bash
   git clone <this repo> /opt/lhcc-volunteers
   cd /opt/lhcc-volunteers
   npm install
   npm run build
   ```
2. **Configure environment.** Copy `.env.example` to `/opt/lhcc-volunteers/.env` and fill it in —
   `BETTER_AUTH_SECRET` (generate with `openssl rand -base64 32`), `BETTER_AUTH_URL` (your public
   HTTPS URL), `GOOGLE_CLIENT_ID`/`SECRET` if using Google sign-in.
3. **Run migrations and seed the first admin:**
   ```bash
   npm run db:migrate -w apps/api
   npm run db:seed -w apps/api
   ```
4. **Reverse proxy / HTTPS.** Google OAuth needs a stable public HTTPS callback URL
   (`{BETTER_AUTH_URL}/api/auth/callback/google`). The app itself only serves plain HTTP — put a
   reverse proxy in front (e.g. [Caddy](https://caddyserver.com/) for automatic TLS, or a
   Cloudflare Tunnel if you don't want to open a port at home).
5. **Install the systemd service:**
   ```bash
   sudo useradd -r -s /usr/sbin/nologin lhcc   # if it doesn't already exist
   sudo chown -R lhcc:lhcc /opt/lhcc-volunteers
   sudo cp deploy/lhcc-volunteers.service /etc/systemd/system/
   sudo systemctl daemon-reload
   sudo systemctl enable --now lhcc-volunteers
   sudo journalctl -u lhcc-volunteers -f   # tail logs
   ```
6. **Backups.** A nightly job (2am) backs up the SQLite database into
   `apps/api/data/backups/` (last 14 kept) using `better-sqlite3`'s `.backup()` API, which is safe
   to run against a live database in WAL mode. Since SD card failure is the most common Pi failure
   mode, set up the off-Pi copy below too — an admin can also see the last backup time and trigger
   one immediately from **Reports** in the app.

   **Off-Pi backup to Cloudflare R2 (optional but recommended):**
   1. In the Cloudflare dashboard: **R2 Object Storage → Create bucket** (e.g. `lhcc-volunteers-backups`).
      Note the **Account ID** shown on the R2 overview page.
   2. **R2 → Manage R2 API Tokens → Create API Token**, permission **Object Read & Write**, scoped
      to just that bucket. Save the Access Key ID and Secret Access Key it gives you — the secret
      is only shown once.
   3. Add to `.env`: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME`
      (see `.env.example`). No bucket endpoint URL to configure — it's derived from the account ID.
   4. Restart the service. From then on, every nightly (and manually-triggered) backup also uploads
      to the bucket and prunes it down to the last `R2_BACKUP_RETENTION_COUNT` (default 5).

   Leaving the R2 variables unset is fine — backups stay local-only, same as before.

### Updating a deployed instance

```bash
cd /opt/lhcc-volunteers
git pull
npm install
npm run db:generate -w apps/api && npm run db:migrate -w apps/api   # only if the schema changed
npm run build
sudo systemctl restart lhcc-volunteers
```

## Not yet implemented

Deliberately deferred — the schema was designed so both are additive, no restructuring needed:

- **Automated reminder emails** to volunteers who haven't set availability for upcoming occurrences
  they're eligible for.
- **Automated email notification** when a volunteer is assigned (auto-scheduled or manually).

Until then, admin-created accounts without a password are expected to sign in with Google using the
exact email address the admin entered (account linking handles this automatically).
