# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A volunteer scheduling app for a church: manage recurring schedules (worship band, greeters,
ushers, ...) and one-off events (rummage sale, ...), let volunteers self-manage their availability
and team membership, and let admins auto-schedule volunteers fairly over a rolling lookback window
with manual override. Designed to run as a single Node process on a Raspberry Pi.

## Commands

Run from the repo root (npm workspaces monorepo: `apps/api`, `apps/web`, `packages/shared`).

```bash
npm install
cp .env.example apps/api/.env      # fill in BETTER_AUTH_SECRET at minimum, see below

npm run dev                        # apps/api (tsx watch, :3000) + apps/web (Vite, :5173) together
npm run build                      # builds shared -> web -> apps/api, in that order (order matters)
npm run start                      # runs the production build; api/dist/server.js serves the built SPA itself
npm run typecheck                  # typechecks all three workspaces (run before considering a change done)

npm run db:generate -w apps/api    # generate a Drizzle migration after changing apps/api/src/db/schema/*
npm run db:migrate                 # apply migrations (creates apps/api/data/lhcc.sqlite)
npm run db:seed                    # create the first admin from SEED_ADMIN_EMAIL/PASSWORD in .env
```

Single-workspace equivalents: `npm run <script> -w apps/api`, `-w apps/web`, `-w packages/shared`.
`packages/shared` must be rebuilt (`npm run build -w packages/shared`) after editing its schemas —
`apps/api` and `apps/web` resolve `@lhcc/shared` to its built `dist/`, not its source, so a stale
build silently hides type errors until you rebuild it.

There is no test suite yet (`apps/api`'s `npm test` runs vitest but no `*.test.ts` files exist).

Minimum `.env` for local dev (full list in `.env.example`):
```
BETTER_AUTH_SECRET=some-long-random-string
BETTER_AUTH_URL=http://localhost:3000
TRUSTED_ORIGINS=http://localhost:5173
SEED_ADMIN_EMAIL=admin@example.com
SEED_ADMIN_PASSWORD=changeme123
```
Google sign-in is optional locally — without `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`, only the
email/password login form is available, which is enough to exercise every feature.

## Architecture

### Shared schemas are the API contract

`packages/shared/src/schemas/*.ts` (zod) are imported by **both** sides: `apps/api` uses them as
Fastify route validators (`fastify-type-provider-zod`, route handlers typed as
`FastifyPluginAsyncZod`), and `apps/web` imports the same inferred types for its TanStack Query
hooks and forms. There is no codegen step and no tRPC — when a route's request/response shape
changes, edit the shared schema first, rebuild `packages/shared`, then update the route and the
frontend hook together.

### API structure (`apps/api/src`)

- `modules/<domain>/{routes.ts,service.ts}` — one pair per domain (assignments, availability,
  events, occurrences, reports, scheduling, teams, users). `routes.ts` handles auth/validation and
  DTO shaping; `service.ts` holds the Drizzle queries. Admin-only routes call `requireAdmin(request)`
  from `auth/plugin.ts`; anyone-authenticated routes call `requireAuth(request)`.
- `db/schema/auth.schema.ts` — hand-written to match what `@better-auth/cli generate` would produce
  (user/session/account/verification), extended with better-auth's `additionalFields` (`role`,
  `phone`, `active` on `user`). These additionalFields **are** returned directly on
  `session.user` by better-auth — no extra query needed to read a caller's role.
- `db/schema/core.schema.ts` — the domain model (see below) plus Drizzle `relations()` used by
  relational queries (`db.query.X.findMany({ with: {...} })`) throughout the service layer.
- `auth/plugin.ts` — better-auth speaks the Fetch API (`Request`/`Response`); Fastify doesn't, so
  this hand-adapts Fastify's request/reply to/from a `Request`/`Response` and mounts it at
  `/api/auth/*`. It also decorates every request with `request.session` up front.
- `jobs/` — `generateOccurrences.ts` (materializes recurring events into dated `event_occurrences`,
  see below), `ensureSystemTeams.ts` (provisions the "All Volunteers" team), `backupDb.ts` (nightly
  SQLite backup). All three run once on boot and then on a schedule via `node-cron`, wired in
  `server.ts`.
- `modules/scheduling/fairness.ts` + `autoSchedule.ts` — the fairness ranking and greedy auto-fill
  algorithm; also reused by the manual "assign a volunteer" dropdown (`GET
  /api/occurrences/:id/eligible-candidates`) so manual picks are fairness-ordered too.

### Data model

`events` (definition: name, location, recurring flag + RRULE + timezone, or one-off) →
`event_role_templates` (what roles a recurring event needs each time) → `event_occurrences`
(concrete dated instances, materialized ahead by `OCCURRENCE_HORIZON_WEEKS`, one row per date,
unique on `(eventId, startAt)`) → `volunteer_roles` (the actual per-occurrence opportunity,
optionally `stackable`) → `assignments` (user ↔ role, `status` scheduled/confirmed/declined/completed).
One-off events skip the template step and write their occurrence + roles directly.

`teams` / `team_memberships` are separate from all of the above. One team is special:
`teams.isSystemTeam` marks the auto-provisioned "All Volunteers" team, which has **no real
`team_memberships` rows** — `fairness.ts` and `modules/teams/service.ts` special-case it to treat
every active user as a member. Assign a role to this team when it can be filled by anyone.

`availability` rows are single-day (`startDate === endDate`), upserted per date via
`PUT /api/availability/(me|:userId)/dates/:date` — not a freeform date-range picker. No row for a
date means "hasn't responded," which is treated as unavailable but is distinguishable in the UI
from an explicit `status: 'unavailable'`.

### Frontend structure (`apps/web/src`)

- `api/hooks.ts` — every TanStack Query hook lives here (single file, grouped by domain); `api/client.ts`
  is the thin fetch wrapper. Add new hooks here rather than calling `fetch` from components.
- `routes/` — volunteer-facing pages; `routes/admin/` — admin-only pages, gated by `RequireAdmin` in
  `App.tsx` (`RequireAuth` for anyone-signed-in routes). Occurrences have two views over the same
  data: `/admin/occurrences/:id` (full edit) and `/occurrences/:id` (read-only, for volunteers who
  click through from the Calendar).
- `index.css` — design tokens (CSS custom properties for the church's brand colors/fonts) plus
  utility classes (`.btn`/`.btn-primary`/`.btn-secondary`/`.btn-ghost`/`.btn-danger`, `.card`,
  `.badge`/`.badge-success`/`.badge-warning`/`.badge-danger`). Use these instead of ad hoc inline
  hex colors when adding UI.
- `components/StackedBarChart.tsx` is a hand-rolled CSS bar chart, not a charting library —
  `recharts` (both v2 and v3) renders invisible/broken bars in this environment; don't reintroduce it.

## Gotchas

- `import rrulePkg from 'rrule'; const { rrulestr } = rrulePkg;` — a named import
  (`import { rrulestr } from 'rrule'`) throws under Node's ESM loader for this package.
- Zod v4, not v3. `idSchema` in `packages/shared` is `z.string().min(1)`, deliberately **not**
  `.uuid()` — better-auth generates non-UUID IDs for `user`/`session`/`account`, while this app's
  own tables use `randomUUID()`. Don't tighten it.
- Root `package.json` has an `overrides` block pinning `react`/`react-dom` to a single version.
  This is load-bearing: better-auth's optional React client dependency was getting hoisted
  separately from `apps/web`'s own React, causing a duplicate-React-copy "Invalid hook call" bug.
  Don't remove it without re-verifying.
- SQLite runs in WAL mode with `foreign_keys = ON` (set in `db/client.ts`); the "max one role per
  occurrence unless stackable" rule is enforced in application code (`modules/assignments/service.ts`),
  not a DB constraint — SQLite can't express that cross-table rule as one.
