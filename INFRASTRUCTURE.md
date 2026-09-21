# Infrastructure

How dayoneof is built and how to run it. One app, one process: a SvelteKit site with the Slack
bot living inside it as a route, deployed as a container on Orchard, backed by Airtable.

## Stack

- **SvelteKit 2 + Svelte 5** (runes mode), plain `.js` server files — no TypeScript, but
  `tsconfig.json` has `checkJs: true` + `strict: true`, so every `.js` file needs JSDoc
  `@param`/`@returns` annotations. `npm run check` must stay at 0 errors.
- **Airtable** is the entire database — four tables, no SQL, plain `fetch` against Airtable's
  REST API (`src/lib/server/airtable.js`), no SDK.
- **Orchard** hosts the site as a container (`@sveltejs/adapter-node`, started with `node build`)
  and runs the three cron routes as scheduled jobs.
- **Slack** is the primary interface for participants — a bot listens on `/api/slack/events` for
  submissions, DMs, and commands.
- **Hack Club Auth (HCA)** gates who can count a submission — sign-in via OIDC.
- **unified-socials-db** (Hack Club's own service) supplies view/like counts and video titles for
  tracked videos, read-only.

## Layout

```
scripts/                 one-off setup helpers, plain node (not part of the app)
  setup_airtable.js       creates the four tables in a base via Airtable's metadata API
  slack_manifest.js       prints an importable Slack app manifest

src/lib/server/          server-only modules (SvelteKit refuses to ship these to the browser)
  config.js               env resolution (APP_ENV dev/prod), isAdmin, requireEnv
  schema.js               Airtable table/field name map (F) — no $env, so scripts can import it
  airtable.js             REST client: find/list/create/update/remove/upsert
  slack.js                Slack Web API wrappers: postMessage/updateMessage/dm/reactions/etc
  hca.js                  Hack Club Auth OIDC (authorize/token/userinfo)
  session.js              signed session cookie for the logged-in participant
  links.js                extracts + normalizes YouTube/TikTok/Instagram links from message text
  streak.js                streak/freeze/milestone math — pure functions, unit-tested
  verification.js         HCA verification_status check — pure, unit-tested
  messages.js              every user-facing Slack message string, in one place
  unified.js               unified-socials-db read client (views/likes/title lookup)
  jobs.js                  the three cron job bodies, shared with the admin panel

src/routes/
  +page.svelte                      landing page
  leaderboard/                      three boards: streaks, total views, top videos
  gallery/                          every submission, sortable by date or views
  user/[slackId]/                   one person's post history
  admin/                            admin-only dashboard (see below)
  api/slack/events/                 the bot
  api/cron/{reconcile,leaderboard,remind}/   cron endpoints, thin wrappers around jobs.js
  api/auth/{login,callback,logout}/          HCA sign-in
```

## Dev vs prod

There are two of most things external — two Slack apps, two site URLs, two sets of Airtable
tables — and one `APP_ENV` var picks which set the app loads. Nothing else changes with it: same
code, same routes, same behaviour, just different data and credentials.

Airtable is the exception to the "two of everything" shape: both environments share **one base**,
and dev works against a `_dev` copy of each table (`participants_dev`, `days_dev`,
`submissions_dev`, `reviews_dev`). Prod keeps the bare names. `schema.js`'s `tablesFor(appEnv)`
applies the suffix and `config.js` exports the resolved map as `TABLES`, so every call site keeps
writing `TABLES.submissions` and lands in the right place automatically. One base means one base
id, one token grant, and one Airtable tab to look at when something's wrong.

Every var in `.env` may be suffixed `_DEV` or `_PROD`. `config.js` looks for `NAME_<APP_ENV>`
first and falls back to the bare `NAME`, so anything genuinely shared is written once without a
suffix while the things that differ are written twice:

```
APP_ENV=dev

AIRTABLE_BASE_ID=app...            # shared — one base, `_dev` tables inside it
SLACK_BOT_TOKEN_DEV=xoxb-...
SLACK_BOT_TOKEN_PROD=xoxb-...
```

`APP_ENV` defaults to `dev` when unset, so a machine that's missing it never reaches for
production. Both setup scripts take the same `dev`/`prod` argument and resolve vars the same way.

`SESSION_SECRET` and `CRON_SECRET` belong in the per-environment column even though nothing about
them is environment-specific, because sharing them hands dev a key to prod: the same
`SESSION_SECRET` means a session cookie signed on your laptop authenticates against the
production site — including `/admin` — and the same `CRON_SECRET` means the value sitting in your
local `.env` can fire prod's reconcile and post a leaderboard to the real announce channel. The
dev copy lives in a file on a laptop and gets pasted into terminals; the prod copy shouldn't.

What's genuinely shared is the narrow set where dev and prod want the identical value and leaking
the dev copy costs nothing extra: `AIRTABLE_TOKEN`/`AIRTABLE_BASE_ID` (one base, see above),
`HCA_CLIENT_ID`/`HCA_CLIENT_SECRET` (one HCA app, see below), `UNIFIED_SOCIALS_TOKEN`
(read-only), `ADMIN_SLACK_IDS`, `MIN_REVIEW_LENGTH`.

## Data model (Airtable)

Four tables, times two environments — the names below are prod's; dev's carry a `_dev` suffix
(see "Dev vs prod"). Field names are identical in both and live once in `schema.js`'s `F` map —
rename there too if you rename a column in Airtable. `npm run setup:airtable -- <env>` builds
whichever set is missing.

### `participants` — one row per person, keyed on `slack_id`

Only ever created by the HCA sign-in flow (`api/auth/callback`) — the bot never auto-creates a
participant on first post, since a post only counts once someone has signed in and HCA reports
them verified.

| field | type | notes |
| --- | --- | --- |
| `slack_id` | Single line text | primary field |
| `name`, `email`, `tz` | text | `tz` best-effort backfilled from Slack at sign-in |
| `status` | Single select | `notStarted` \| `active` \| `frozen` \| `broken` |
| `verification_status` | Single line text | HCA's claim — `needs_submission`, `pending`, `verified_eligible`, `verified_but_over_18`, `rejected`, `not_found`. Only rows starting with `verified` count posts. |
| `days_completed`, `streak_freezes`, `days_elapsed`, `current_streak` | Number | cache rewritten by the reconcile cron and by every submission |
| `last_milestone` | Number | highest milestone announced, so it fires once |
| `reminder_hour` | Number | local hour for the daily DM; null = no reminder |
| `last_reminder_day` | Single line text | guards against double-sending a reminder |
| `total_views` | Number | recomputed by `syncParticipantTotalViews` (see below), never incremented |

### `days` — one row per participant per UTC calendar day

Source of truth for streaks. `status` is `posted` \| `frozen` \| `missed`. A streak is "count
back from today while status != missed"; a freeze is a row, not a counter you have to trust.

| field | type |
| --- | --- |
| `slack_id` | Single line text (primary field) |
| `date` | Single line text, `YYYY-MM-DD` — kept as plain text (not an Airtable Date field) because filter formulas do exact string matches like `{date} = "2026-01-01"` |
| `status` | Single select — `posted` \| `frozen` \| `missed` |

### `submissions`

| field | type | notes |
| --- | --- | --- |
| `submission_id` | Autonumber | primary field |
| `slack_id`, `url`, `platform`, `video_id` | text | `url` is always rebuilt canonical (see links.js below), never the raw pasted link |
| `posted_at` | Date, with time | |
| `day` | Single line text | `YYYY-MM-DD`, same reasoning as `days.date` |
| `counted_toward_streak` | Checkbox | false for a same-day repeat post |
| `channel_id`, `message_ts`, `permalink` | text | the poster's original message |
| `review_count` | Number | |
| `views` | Number | kept in sync by `syncParticipantTotalViews` — see "Views sync" below |
| `title` | Single line text | video title (YouTube) or first line of caption (TikTok/Instagram), from unified-socials |
| `unified_id` | Single line text | set once unified-socials confirms a match |
| `reply_message_ts` | Single line text | the `ts` of *our* confirmation reply (not the poster's message) — lets reconcile edit that message with fresh stats instead of posting a new one nightly |
| `streak_at_post`, `freezes_at_post` | Number | captured once at submit time so an edited reply stays historically accurate |

`likes` is deliberately not a column — it's cheap to re-fetch live wherever it's actually shown
(a Slack message, admin's "Check stats"), so persisting it would just be one more field to keep
in sync for no benefit.

### `reviews`

| field | type |
| --- | --- |
| `review_id` | Autonumber (primary field) |
| `submission_id` | Single line text — stores `submissions.submission_id`, not an Airtable link |
| `reviewer_id`, `reviewed_at`, `message_ts`, `length`, `text` | — |

## The bot: `POST /api/slack/events`

Single endpoint, HTTP Events API (not Socket Mode). Verifies the Slack v0 signature over the raw
body, echoes the `url_verification` challenge, acks retries, then routes on `event.type`:

- **`message` in the submissions channel, with a supported link** — not signed in → 🔒 + reply
  telling them to sign in; signed in but HCA hasn't verified them → 🔒 + reply explaining that;
  otherwise: records the day, advances the streak, reacts ✅, replies in-thread with the streak
  and (if the video happens to already be tracked) live stats. A same-day repeat gets 🔁 and
  still replies in-thread, just without advancing the streak.
- **`message` in the submissions channel, no supported link** — reacts ❓, replies in-thread
  explaining which platforms count.
- **threaded reply by someone other than the poster, 40+ characters** — records a review, ✅ 👀.
- **`app_mention`** — `status`, `remind <hour>`, `reviews`.
- **`member_joined_channel`** — if it's the bot itself joining, posts a one-line confirmation.
  This is a deliberate smoke test for "is Slack delivering events to this endpoint at all" and is
  independent of everything else — useful when the bot looks totally inert, since it isolates
  connectivity from application logic.

Never 500s at Slack — errors are logged and swallowed, always returning 200, since a 500 just
buys a retry of something already broken.

Milestones (2/7/15/25 days) fire inside the submission handler: announce in the announce channel,
DM the participant, write `last_milestone` so it doesn't repeat.

## Cron jobs

Three `GET /api/cron/<name>` routes, each gated on `Authorization: Bearer $CRON_SECRET`. Each
route is a thin wrapper around a shared function in `jobs.js` (also callable from the admin
panel). Orchard jobs call them on the schedules below — see "Cron on Orchard".

| job | schedule | what it does |
| --- | --- | --- |
| `reconcile` | `0 0 * * *` | For every active/frozen participant with history before yesterday and no `posted` row for yesterday: spends a freeze (writes a `frozen` day) or breaks the streak. Then refreshes views/likes/title for every tracked submission and edits each one's original Slack reply in place. |
| `leaderboard` | `15 0 * * *` | Posts three boards to the announce channel: longest streaks, most total views, highest-viewed videos. Scheduled *after* reconcile on purpose, so it reflects that night's refreshed views. |
| `remind` | `0 * * * *` | DMs anyone whose `reminder_hour` matches the current hour in their `tz` and who hasn't posted today. |

**Views sync**: `submissions.views` and `participants.total_views` get written in two places —
at submit time (if the video happens to already be tracked) and nightly in reconcile — both
calling the same `syncParticipantTotalViews(slackId)`, which recomputes a participant's total by
summing their stored `submissions.views` fresh from Airtable rather than incrementing. This
matters: an earlier version summed only submissions whose live re-fetch succeeded *in that one
pass*, so a single transient fetch failure could drop an already-known video's views out of the
total. Recomputing from stored data instead means a transient failure can no longer corrupt the
total — the site and the Slack leaderboard always agree with what a thread reply already showed.

## Streak rules (`streak.js`, pure functions)

- First link of a UTC day counts. Later links the same day are stored, react 🔁, don't advance.
- Every 2 days completed earns a freeze, capped at 3.
- A gap spends one freeze per missed day. Cover the whole gap and the streak continues; run out
  and it resets to 1.

## Links (`links.js`)

Slack wraps every URL in message text as `<url>` or `<url|label>` — even a plain pasted link,
not just markdown-authored ones — before it reaches the Events API. `extractLink` unwraps that
first, then never stores what was pasted: it always rebuilds a canonical URL from the captured
platform + id (`youtube.com/watch?v=<id>` even for `youtu.be`/`shorts` input, TikTok keeps the
`@username` segment, Instagram keeps `reel` vs `p`), so query params, tracking junk, and mobile
subdomains never end up stored either.

## unified-socials-db integration (`unified.js`)

Read-only. `GET https://unified-socials-db.hackclub.com/api/v1/posts?platform=...&platform_post_id=...`
looks a video up by its platform + id (confirmed against unified-socials-db's own published API
docs — `GET /api/v1/<relation>` takes column names as equality query params). Returns views,
likes, and title (first line only, truncated).

**Writing is disabled** — `submitPost` in `unified.js` is commented out. There's no confirmed
write endpoint for "register this submission" anywhere this build had access to; the MCP server
backing this data is explicitly read-only SQL. Do not enable without explicit approval.

## Sign-in and verification gate

Sign-up is HCA → Slack invite. `hca.js` matches `hackclub/jamegam`'s implementation: issuer
`auth.hackclub.com`, `POST /oauth/token` (JSON body), `GET /api/v1/me` for identity — which
returns `slack_id` directly, since an HCA account is a Hack Club Slack account, so no separate
Slack lookup-by-email is needed. The callback route upserts the participant, invites them to the
submissions channel, and sets a signed session cookie.

A post only counts if the poster has an existing `participants` row (created only via this flow)
**and** that row's `verification_status` starts with `verified`.

## Admin panel (`/admin`)

Gated by `ADMIN_SLACK_IDS` (comma-separated Slack user IDs). Everything for debugging lives
here — there is no Slack `debug` command.

- Read-only participant table (correct fields directly in Airtable instead — this page
  deliberately doesn't duplicate that), with a "Force verify" button per unverified participant
  for unblocking testing without waiting on real HCA verification.
- Buttons to run the three cron jobs on demand. "Run remind" here is a pure test blast — DMs
  everyone regardless of hour/posted-today/already-reminded, and never writes
  `last_reminder_day`, so it can't interfere with the real hourly cron.
- "Check unified-socials stats" — paste a video URL, see its live view/like/title lookup.
- "Danger zone" — a browser-confirmed "Nuke all data" button that deletes every row in every
  table. For wiping test data only.

## Debug logging

Every outbound call to Airtable, Slack, HCA, and unified-socials prints a line tagged
`[EXTCALL]`. Every inbound Slack event prints a line tagged `[SLACKEVENT]`, including why it was
or wasn't handled. Both are grep-tagged on purpose — `grep -rn '\[EXTCALL\]\|\[SLACKEVENT\]' src`
finds every one when it's time to strip them.

---

## Setup from scratch

Do these roughly in order — later steps need IDs/secrets from earlier ones.

### 0. Prerequisites

- Node 20+
- A Slack workspace you can install apps into
- An Airtable account
- [ngrok](https://ngrok.com/download) (or `cloudflared tunnel`) for local dev — Slack's Events
  API and HCA's OAuth redirect both need a public HTTPS URL, `localhost` won't work.

```
npm install
cp .env.example .env
```

### 1. Airtable

Create one base and a **personal access token**
([airtable.com/create/tokens](https://airtable.com/create/tokens)). Two things to get right, and
Airtable reports the same `INVALID_PERMISSIONS_OR_MODEL_NOT_FOUND` 403 when either is wrong:

- **Scopes**: `data.records:read`, `data.records:write` for the app, plus
  `schema.bases:read` *and* `schema.bases:write` for the setup script. Read is a separate scope —
  granting write does not imply it, and the script lists tables before creating any.
- **Access**: the base itself has to be listed under the token's access, not just the scopes.

Grab the **base ID** (Help → API documentation, starts with `app...`).

```
AIRTABLE_TOKEN=pat...
AIRTABLE_BASE_ID=app...
```

Then let the script build the tables instead of clicking them in — once per environment, into
that same base:

```
npm run setup:airtable -- prod    # participants, days, submissions, reviews
npm run setup:airtable -- dev     # participants_dev, days_dev, submissions_dev, reviews_dev
```

Each run creates its four tables with the field types documented above, and is safe to re-run —
it only adds what's missing, so it doubles as a way to top up after a schema change. Running both
gives you eight tables side by side in one base. (Needs Node 20.6+ for `--env-file`.)

**Run both setup scripts from your own machine, including for prod.** Neither is part of the
app: `setup_airtable.js` is an HTTP client for `api.airtable.com` and `slack_manifest.js` just
prints JSON to stdout. They provision the *external* services, so where the app happens to be
running is irrelevant — you don't need a shell in the container, and nothing about the schema
ships in the image. Both runs read the same `AIRTABLE_BASE_ID` from your local `.env`.

### 2. Start the app and expose it

The Slack app is created from a manifest that declares its Request URL, and Slack verifies that
URL during the import — so the site has to be reachable *before* step 3, not after.

```
npm run dev
```

In a second terminal:

```
ngrok http 5173
```

Copy the forwarding URL into `.env`, then restart `npm run dev`:

```
PUBLIC_SITE_URL_DEV=https://xxxx.ngrok-free.app
```

### 3. Slack app

One app per environment, each pointed at its own URL. Print a manifest:

```
npm run setup:slack -- dev      # or: prod
```

1. [api.slack.com/apps](https://api.slack.com/apps) → **Create New App → From an app manifest**,
   pick the workspace, paste the JSON.
2. The manifest already sets the bot scopes, the three subscribed events, the Request URL
   (`<PUBLIC_SITE_URL>/api/slack/events`) and — importantly — **Socket Mode off**. This app uses
   the HTTP Events API; with Socket Mode on the Request URL still verifies fine (that's a one-time
   HTTP challenge, unrelated to Socket Mode) but Slack then delivers zero real events over HTTP.
   That's the single easiest thing to get wrong here.
3. **Install to Workspace**, copy the **Bot User OAuth Token** (`xoxb-...`).
4. **Basic Information** → copy the **Signing Secret**.

```
SLACK_BOT_TOKEN_DEV=xoxb-...
SLACK_SIGNING_SECRET_DEV=...
```

5. Create (or pick) a channel for submissions and one for announcements — can be the same
   channel while testing. Invite the bot: `/invite @your-bot-name`. Get each channel's ID
   (right-click → View channel details).

```
SLACK_SUBMISSION_CHANNEL_ID_DEV=C...
SLACK_ANNOUNCE_CHANNEL_ID_DEV=C...
```

The manifest asks for both the public (`channels:history`, `channels:manage`) and private
(`groups:history`, `groups:write`) channel scopes, so either kind of submissions channel works
without editing it. Trim the pair you don't need if you'd rather ask for less —
`channels:manage` does not cover invites to private channels, and vice versa.

When the ngrok URL changes, update `PUBLIC_SITE_URL_DEV` and re-paste the new Request URL under
**Event Subscriptions** (re-running `setup:slack` prints it).

### 4. HCA (Hack Club Auth)

Register an OAuth application with Hack Club Auth (ask in Hack Club's Slack). Enable the
`openid email name slack_id verification_status` scopes.

One app covers both environments, so these stay unsuffixed:

```
HCA_CLIENT_ID=...
HCA_CLIENT_SECRET=...
```

The one thing that is still per-environment is the **redirect URI**, because it's derived from
`PUBLIC_SITE_URL`. Register both on the same app:

```
https://<ngrok host>/api/auth/callback
https://<the real domain>/api/auth/callback
```

The ngrok one changes every time the tunnel restarts, so expect to re-register it.

Skippable if you only want to test the Slack bot and cron jobs — sign-in is only used by
`/api/auth/*` and the landing page.

### 5. Remaining secrets

Generate `SESSION_SECRET` and `CRON_SECRET` twice — once for dev, once for prod. See "Dev vs
prod" above for why they don't get shared.

```
SESSION_SECRET_DEV=$(openssl rand -hex 32)
CRON_SECRET_DEV=$(openssl rand -hex 32)
```

(Windows without `openssl`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.)

`UNIFIED_SOCIALS_TOKEN` — mint a personal token from the unified-socials-db web app's MCP/API
page. Safe to leave blank while testing the rest of the bot — it's only used by reconcile's
views pass and admin's "Check stats".

`ADMIN_SLACK_IDS` — comma-separated Slack user IDs (the `U...` kind) allowed to use `/admin`.
Blank means nobody is an admin.

`MIN_REVIEW_LENGTH` — default `40` is fine.

### 6. Try it

- Kick the bot from the submissions channel and re-invite it. It should immediately post
  "👋 I'm in!" — if not, don't bother testing links yet, recheck steps 2 and 3.
- Sign in at `<PUBLIC_SITE_URL>/api/auth/login`. Use admin's "Force verify" to unblock testing
  without waiting on real HCA verification.
- Post a link → ✅ + threaded reply. Post it again → 🔁 + threaded reply. Post a non-link → ❓.
  Reply in-thread as someone else, 40+ characters → 👀.
- `@your-bot status` / `remind 9` / `reviews`.
- `/leaderboard`, `/gallery`, `/user/<slackId>` render from Airtable.
- Cron routes work standalone too:

  ```
  curl -H "Authorization: Bearer $CRON_SECRET" $PUBLIC_SITE_URL/api/cron/reconcile
  curl -H "Authorization: Bearer $CRON_SECRET" $PUBLIC_SITE_URL/api/cron/leaderboard
  curl -H "Authorization: Bearer $CRON_SECRET" $PUBLIC_SITE_URL/api/cron/remind
  ```

### 7. Checks

```
npm run check
npm test
```

### 8. Deploying (Orchard)

Prod runs as a container on [Orchard](https://orchard.hackclub.com) — project `zrl@dayoneof`,
environment `Production`, deployment `dayoneof`, built from `hackclub/dayoneof` on `main` with
auto-deploy on.

Repeat steps 1 and 3 with `prod` to get the production base and Slack app. Then set the
deployment's environment variables in Orchard — **unsuffixed**, plus `APP_ENV=prod`:

```
APP_ENV=prod
PUBLIC_SITE_URL=https://<the real domain>
ORIGIN=https://<the real domain>
AIRTABLE_TOKEN=pat...
AIRTABLE_BASE_ID=app...
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_SUBMISSION_CHANNEL_ID=C...
SLACK_ANNOUNCE_CHANNEL_ID=C...
HCA_CLIENT_ID=...
HCA_CLIENT_SECRET=...
SESSION_SECRET=...
CRON_SECRET=...
UNIFIED_SOCIALS_TOKEN=...
ADMIN_SLACK_IDS=U...,U...
```

The `_DEV`/`_PROD` suffixes are a local-`.env` convenience, not something the container needs: the
deployment only ever holds one environment's worth of values, so the unsuffixed names are the
clean spelling there and the fallback in `config.js` picks them up unchanged. `APP_ENV=prod` is
then mostly a declaration of intent — it's what makes a stray `*_DEV` var lose and keeps
`requireEnv`'s error messages honest about which environment failed.

Mark the credentials **secret** in Orchard (`AIRTABLE_TOKEN`, `SLACK_BOT_TOKEN`,
`SLACK_SIGNING_SECRET`, `HCA_CLIENT_SECRET`, `SESSION_SECRET`, `CRON_SECRET`,
`UNIFIED_SOCIALS_TOKEN`). Secret vars route through a Kubernetes Secret and are write-only —
otherwise every project member can read them straight off the deployment.

`ORIGIN` is an `adapter-node` requirement, not one of ours: behind the ingress proxy the server
can't infer its own public origin, and every `POST` form action — the whole admin panel — fails
its CSRF origin check without it. Same value as `PUBLIC_SITE_URL`.

Three things the container needs that Vercel provided implicitly:

- **A node server build.** `@sveltejs/adapter-node` writes `build/index.js`, which is what
  Orchard's `node build` start command expects. (`adapter-vercel` emitted `.vercel/output`
  instead, so the pod crash-looped on `Cannot find module '/app/build'`.)
- **A public ingress.** The auto-generated domain ships with Orchard access protection on, which
  puts a login in front of every request — including Slack's event POSTs and HCA's OAuth
  redirect, neither of which can authenticate. Protection has to be off.
- **Its own scheduler.** See below.

### 9. Cron on Orchard

There's no `vercel.json` any more — Vercel's scheduler isn't running these. Orchard's equivalent
is a **job**: a cron-scheduled pipeline in the project's namespace. Three jobs, one per route,
each an `app`-type step that runs inside the deployment's own image and environment, so
`$CRON_SECRET` is already in scope and the call never leaves the cluster:

| job | cron (UTC) | step |
| --- | --- | --- |
| `reconcile` | `0 0 * * *` | `GET /api/cron/reconcile` |
| `leaderboard` | `15 0 * * *` | `GET /api/cron/leaderboard` |
| `remind` | `0 * * * *` | `GET /api/cron/remind` |

Hitting `http://dayoneof.ysws-zrl-dayoneof.svc.cluster.local:3000` rather than the public host
also sidesteps ingress protection entirely, whatever it's set to.

## Not yet built

Per the original plan's "Deferred" list: review queue assignment, fraud/slop pass, plagiarism
reverse search, per-post view milestones auto-updating in-thread.
