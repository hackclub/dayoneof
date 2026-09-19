# Implementation

How to build what `PLAN.md` describes. Reference points: [hackclub/jamegam](https://github.com/hackclub/jamegam)
(SvelteKit + Airtable + Slack, one deploy) and [hackclub/fallout](https://github.com/hackclub/fallout)
(streak jobs: reconcile / notify / leaderboard).

## The one big decision: fold the bot into the site

`app/slack/` today is a standalone Bolt app in Socket Mode with state in a `Map`. It proved the
Slack behaviours work. Don't build on it — **there is one app, `app/dayoneof/`, a SvelteKit site,
and the Slack bot is a route inside it.**

Why:

- Socket Mode needs a process that stays up. A `+server.js` route doesn't — it deploys with the
  site to Vercel and costs nothing when idle.
- Bolt is a large dependency for what is really "verify an HMAC, read `body.event`, call
  `chat.postMessage`". jamegam's `/api/slack/events` does the whole thing in ~90 lines with
  `node:crypto` and `fetch`. Copy that file's shape.
- Airtable is the state either way. Two processes talking to the same base means two places to
  fix every time the schema moves. One place is better.
- The site needs the same data the bot writes (leaderboard, gallery). Same repo, same
  `$lib/server/airtable.js`, no internal API between them.

Everything below assumes `app/slack/` gets deleted once its logic is ported. `src/store.js` is the
piece worth porting nearly verbatim — its streak math is right; it just needs Airtable under it
instead of a `Map`. `src/links.js` (URL parsing) ports as-is. `src/messages.js` (all user-facing
copy in one file) is a good pattern — keep it.

## Layout

Mirrors jamegam. Everything under `$lib/server/` is server-only; SvelteKit refuses to ship it to
the browser.

```
app/dayoneof/
  src/lib/server/
    config.js        every env var, read via $env/dynamic/private, plus the F field-name map
    airtable.js      REST helpers (find / upsert / list). No SDK — plain fetch, like jamegam.
    slack.js         postMessage / postEphemeral / DM / reaction / users.info wrappers
    hca.js           Hack Club Auth OIDC — copy jamegam's verbatim
    session.js       signed cookie for the logged-in participant
    links.js         extract + classify YouTube / Instagram / TikTok URLs (port from app/slack)
    streak.js        all streak, freeze and milestone rules. Pure functions, unit-testable.
    messages.js      all user-facing Slack copy
    unified.js       handoff to the unified-socials DB
  src/routes/
    +page.svelte             landing page (the PLAN.md description + example videos)
    leaderboard/             streaks + views, sortable
    gallery/                 every submission
    api/slack/events/        the bot
    api/cron/reconcile/      nightly streak close-out
    api/cron/remind/         per-user reminder sweep
    api/cron/leaderboard/    00:00 UTC channel post
    api/auth/{login,callback,logout}/   HCA sign-in
```

## Data model (Airtable)

Four tables. `days` is the important one and the part the proof-of-concept didn't have.

**`participants`** — one row per person, keyed on `slack_id`.

| field | notes |
| --- | --- |
| `slack_id` `name` `email` `tz` | from `users.info` on first submission |
| `status` | `notStarted` \| `active` \| `frozen` \| `broken` |
| `days_completed` `streak_freezes` `days_elapsed` | denormalized from `days` by the reconcile cron |
| `last_milestone` | highest milestone announced, so it fires once |
| `reminder_hour` | local hour for the daily DM; null = no reminder |
| `total_views` | refreshed from unified-socials; drives the grand-prize board |

**`days`** — one row per participant per UTC calendar day, `status` = `posted` \| `frozen` \| `missed`.

This is the source of truth for streaks, and it's why fallout's jobs are so short. A streak is
"count back from today while `status != missed`". A freeze is a row, not a counter you have to
trust. A backfill or a manual fix is one row. Compute streaks from here; treat the numbers on
`participants` as a cache the cron rewrites.

**`submissions`** — `submission_id`, `slack_id`, `url`, `platform`, `video_id`, `posted_at`,
`day`, `counted_toward_streak`, `channel_id`, `message_ts`, `permalink`, `review_count`,
`views`, `unified_id`. `video_id` is what a duplicate check keys on.

**`reviews`** — `review_id`, `submission_id`, `reviewer_id`, `reviewed_at`, `message_ts`,
`length`, `text`.

Field names live once in `config.js` as `F`, the way jamegam does it, so renaming a column in
Airtable is a one-line change.

## The bot: `POST /api/slack/events`

Single endpoint, Events API over HTTPS. Subscribe to `message.channels` and `app_mention`.

1. Verify the v0 signature over the **raw** body (`createHmac` + `timingSafeEqual`, 5-minute
   window). Reparsing changes the bytes — read `request.text()` once.
2. `url_verification` → echo `body.challenge`.
3. If `x-slack-retry-num` is set, ack and stop. Slack retries anything not 200'd in 3 seconds;
   acking retries is what stops double-posting.
4. Route on `event.type`:
   - **message in the submissions channel, contains a link** → record it, advance the streak,
     react ✅, reply in thread with the streak state, hand off to unified-socials.
   - **message in the submissions channel, no supported link** → react ❓, ephemeral explaining
     which platforms count.
   - **threaded reply by someone other than the poster, over `MIN_REVIEW_LENGTH`** → record a
     review, react 👀.
   - **`app_mention`** → `status`, `remind <hour>`, `reviews`.
5. Never 500 at Slack. Log the error and return 200 — a 500 just buys a retry of something
   already broken.

Milestones (2 / 7 / 15 / 25 days) fire inside the submission handler: announce in-channel, DM the
fulfillment form, write `last_milestone` so it can't repeat.

The 3-second budget is real. Airtable write + thread reply fits. If the unified-socials handoff or
a views lookup ever makes it tight, kick that work to a queue row and let the reconcile cron drain
it, rather than making Slack wait.

## Cron

Vercel cron hits `GET /api/cron/<name>`. Each route checks `Authorization: Bearer $CRON_SECRET`
first and 401s otherwise — these endpoints are public URLs.

| route | schedule | what it does |
| --- | --- | --- |
| `reconcile` | `5 0 * * *` | For everyone with a live streak and no `posted` row for yesterday: spend a freeze (write a `frozen` day) if they have one, else write `missed` and set `status = broken`. Then rewrite the cached counters on `participants` and DM anyone whose state changed. This is fallout's `StreakReconciliationJob`. |
| `leaderboard` | `0 0 * * *` | Post two boards to the channel — longest active streaks (ties broken by fewest freezes used) and most total views. |
| `remind` | `0 * * * *` | Hourly sweep: DM anyone whose `reminder_hour` matches the current hour in their `tz` and who has no `posted` row for today. Guard on `last_reminder_day` so a retry can't double-send. |

Read one page of `days` and one of `participants` per run and do the grouping in memory. fallout's
leaderboard job is explicit about this — the per-user round trips are what kill it at a few hundred
participants.

## Streak rules

In `streak.js`, as pure functions over a day list, so they're testable without Slack or Airtable.
Port the POC's `recordSubmission` logic; it's correct.

- First link of a UTC day counts. Later links the same day are stored, react 🔁, don't advance.
- Every 2 days completed earns a freeze, capped at 3.
- A gap spends one freeze per missed day. Cover the whole gap and the streak continues; run out
  and it resets to 1.

`PLAN.md` line 10 says "an odd day of their streak" and line 37 says "every 2 days you post" —
the public description wins, so it's every 2 days. Worth confirming before launch.

## unified-socials

Post each submission to the unified-socials DB from the submission handler and store the returned
id on the row. Read back through the MCP server / `/api/v1` JSON API with a personal token: the
`posts` view carries the current metrics, so a nightly pass updates `submissions.views` and
`participants.total_views` for the leaderboard and the $500 grand prize. Don't poll per-view
milestones in the thread until that's steady.

## Site

Static-ish SvelteKit, deployed on Vercel with `@sveltejs/adapter-vercel`. Landing page is the copy
from `PLAN.md` plus the example videos. `/leaderboard` and `/gallery` load from Airtable in
`+page.server.js` with a short cache. Sign-up is HCA → Slack invite, exactly jamegam's
`/api/auth/*` + `conversations.invite` flow — copy those four files and change the channel id.

## Env

```
PUBLIC_SITE_URL=
AIRTABLE_TOKEN=            AIRTABLE_BASE_ID=
SLACK_BOT_TOKEN=xoxb-...   SLACK_SIGNING_SECRET=
SLACK_SUBMISSION_CHANNEL_ID=   SLACK_ANNOUNCE_CHANNEL_ID=
HCA_CLIENT_ID=             HCA_CLIENT_SECRET=
SESSION_SECRET=            CRON_SECRET=
UNIFIED_SOCIALS_TOKEN=
MIN_REVIEW_LENGTH=40
```

Bot scopes: `channels:history`, `chat:write`, `im:write`, `reactions:write`, `app_mentions:read`,
`users:read`, `users:read.email`, `conversations.invite` needs `channels:manage`.

## Order to build it

1. `config.js` + `airtable.js` + the four tables. Nothing works without storage.
2. `/api/slack/events` — signature check, submission → Airtable → thread reply. Test in a private
   channel.
3. `streak.js` + the `days` table, with unit tests. Port `test/logic.test.js`.
4. `/api/cron/reconcile`, then `leaderboard`, then `remind`.
5. Milestones + DMs + the fulfillment form.
6. unified-socials handoff and the nightly views refresh.
7. Landing page, then `/leaderboard` and `/gallery`.
8. HCA sign-in and auto-invite.
9. Delete `app/slack/`.

## Deferred

The review queue (assign each submission to another submitter), the fraud/slop second pass, and
plagiarism reverse search are all in `PLAN.md` and none are needed to launch. When the review queue
does get built, the simplest version is a `reviews` row created empty with an `assigned_to` at
submission time and a DM — no scheduler, no separate queue service.

Per-post view milestones auto-updating in the thread are attractive but mean polling every live
submission. Hold until the unified-socials refresh is proven stable.
