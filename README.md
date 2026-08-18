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

### Quick path: `deploy/setup.sh`

Once the one-off manual steps below are done the first time, `deploy/setup.sh` handles
everything else — pulling `main`, `npm install`, migrations, build, installing/refreshing the
systemd unit, and restarting the service. It's also the update script: re-run it any time to
deploy the latest `main`.

1. **Get the code onto the Pi and create the run user** (native modules like `better-sqlite3`
   need to be installed *on the Pi itself*, ARM, not on your dev machine — `setup.sh` does that
   part for you):
   ```bash
   git clone <this repo> /opt/lhcc-volunteers
   cd /opt/lhcc-volunteers
   sudo useradd -r -s /usr/sbin/nologin lhcc   # if it doesn't already exist
   ```
2. **Install SQLite.** `deploy/setup-sqlite.sh` installs the `sqlite3` CLI (handy for
   inspecting the database or restoring a backup by hand) and the build tools `npm install`
   may need to compile `better-sqlite3` from source if no prebuilt binary matches this Pi's
   architecture/Node version, and provisions the `data/` directory the systemd service writes
   to:
   ```bash
   ./deploy/setup-sqlite.sh
   ```
3. **Run the deploy script once** — with no `apps/api/.env` yet, it creates one from
   `.env.example` with a generated `BETTER_AUTH_SECRET` and stops so you can fill in the rest:
   ```bash
   ./deploy/setup.sh
   ```
4. **Configure environment.** Edit `apps/api/.env` — `BETTER_AUTH_URL` (your public HTTPS URL),
   `TRUSTED_ORIGINS`, `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD`, `GOOGLE_CLIENT_ID`/`SECRET` if
   using Google sign-in, and (optionally) the `R2_*` backup variables — see "Backups" in the
   manual path below.
5. **Reverse proxy / HTTPS.** Google OAuth needs a stable public HTTPS callback URL
   (`{BETTER_AUTH_URL}/api/auth/callback/google`). The app itself only serves plain HTTP — put a
   reverse proxy in front. `deploy/setup-cloudflared.sh` installs `cloudflared` and connects
   this machine to an existing
   [Cloudflare Tunnel](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/)
   if you don't want to open a port at home:
   1. In the Zero Trust dashboard, create the tunnel (**Networks → Tunnels**) and add its public
      hostname route pointing at `http://localhost:3000` — the script doesn't create the tunnel
      or configure routing, only connects to one that already exists.
   2. Copy the tunnel token from the same page, then run:
      ```bash
      ./deploy/setup-cloudflared.sh <tunnel-token>
      ```
   Re-run it any time (e.g. after a fresh clone) — it just restarts the service if already
   installed. To point this machine at a different tunnel, run
   `sudo cloudflared service uninstall` first, then re-run with the new token. If you'd rather
   run your own proxy, [Caddy](https://caddyserver.com/) is a good alternative for automatic TLS.
6. **Re-run the script to deploy:**
   ```bash
   ./deploy/setup.sh
   ```
   This installs/enables the systemd service and starts it; tail logs with
   `sudo journalctl -u lhcc-volunteers -f`.

### Manual path

If you'd rather do it by hand, or want to understand what the scripts do:

1. **Install dependencies and build** (on the Pi, ARM, so `better-sqlite3` compiles for the
   right architecture):
   ```bash
   npm install
   npm run build
   ```
2. **Configure environment.** Copy `.env.example` to `apps/api/.env` and fill it in —
   `BETTER_AUTH_SECRET` (generate with `openssl rand -base64 32`), `BETTER_AUTH_URL` (your public
   HTTPS URL), `GOOGLE_CLIENT_ID`/`SECRET` if using Google sign-in.
3. **Run migrations and seed the first admin:**
   ```bash
   npm run db:migrate -w apps/api
   npm run db:seed -w apps/api
   ```
4. **Reverse proxy / HTTPS** — see step 4 above.
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
7. **Email reminders (optional).** A daily job sends a monthly availability-reminder cycle to
   volunteers with upcoming unset dates (kickoff near the end of each month, up to 3 follow-ups
   every 2 days, stopping early once resolved). It sends via Gmail/Google Workspace SMTP with an
   app password — no separate email service needed.
   1. On the Google account you want emails to come from: **Google Account → Security → 2-Step
      Verification** (must be enabled first) **→ App passwords**. Create one for "Mail" and copy
      the generated 16-character password.
   2. Add to `.env`: `SMTP_USER` (that account's email address), `SMTP_APP_PASSWORD` (the app
      password just generated). `SMTP_HOST`/`SMTP_PORT` default to Gmail's SMTP already;
      `SMTP_FROM` is optional and defaults to `SMTP_USER`.
   3. Restart the service.

   Leaving the SMTP variables unset is fine — the reminder job silently no-ops, same as backups
   without R2 configured.

### Updating a deployed instance

```bash
cd /opt/lhcc-volunteers
./deploy/setup.sh
```

That's `git pull` + `npm install` + `db:migrate` + `npm run build` + reinstall the systemd unit
if it changed + restart, all in one idempotent script — see `deploy/setup.sh`. It refuses to run
if there are uncommitted local changes on the Pi. Note it only ever runs `db:migrate`, never
`db:generate` — migrations are generated during development and committed to the repo, not
generated against a live production database.

## Not yet implemented

Deliberately deferred — the schema was designed so both are additive, no restructuring needed:

- **Automated reminder emails** to volunteers who haven't set availability for upcoming occurrences
  they're eligible for.
- **Automated email notification** when a volunteer is assigned (auto-scheduled or manually).

Until then, admin-created accounts without a password are expected to sign in with Google using the
exact email address the admin entered (account linking handles this automatically).
