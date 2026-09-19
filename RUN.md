# Running dayoneof locally

Everything the app needs, from a completely empty Airtable/Slack account to a working local
dev loop. Do these roughly in order — later steps need IDs/secrets from earlier ones.

## 0. Prerequisites

- Node 20+ (this repo was built/tested on Node 24)
- A Slack workspace you can install apps into
- An Airtable account
- [ngrok](https://ngrok.com/download) (or `cloudflared tunnel`) — Slack Events API and HCA's
  OAuth redirect both need a public HTTPS URL, and `localhost` won't work for either

```
npm install
cp .env.example .env
```

You'll fill in `.env` as you go through the sections below.

## 1. Airtable

1. Create a new base, e.g. "dayoneof". Delete the default table it starts you with.
2. Create four tables with these exact field names (the app reads them from `src/lib/server/config.js`'s `F` map — rename there too if you rename in Airtable).

**`participants`**

| field | type |
| --- | --- |
| `slack_id` | Single line text (make this the primary field) |
| `name` | Single line text |
| `email` | Email |
| `tz` | Single line text |
| `status` | Single select — options: `notStarted`, `active`, `frozen`, `broken` |
| `days_completed` | Number, integer |
| `streak_freezes` | Number, integer |
| `days_elapsed` | Number, integer |
| `current_streak` | Number, integer |
| `verification_status` | Single line text — HCA's `verification_status` claim (`needs_submission`, `pending`, `verified_eligible`, `verified_but_over_18`, `rejected`, `not_found`). Only rows where this starts with `verified` count posts toward a streak — see section 8. |
| `last_milestone` | Number, integer |
| `reminder_hour` | Number, integer |
| `last_reminder_day` | Single line text |
| `total_views` | Number, integer |

**`days`**

| field | type |
| --- | --- |
| `slack_id` | Single line text (primary field) |
| `date` | Single line text — keep this a plain `YYYY-MM-DD` string, not an Airtable Date field. The code does exact string matches like `{date} = "2026-01-01"` in filter formulas, which is simplest against a text field. |
| `status` | Single select — options: `posted`, `frozen`, `missed` |

**`submissions`**

| field | type |
| --- | --- |
| `submission_id` | Autonumber (primary field) |
| `slack_id` | Single line text |
| `url` | URL |
| `platform` | Single select — options: `youtube`, `tiktok`, `instagram` |
| `video_id` | Single line text |
| `posted_at` | Date, with "include a time field" turned on |
| `day` | Single line text (`YYYY-MM-DD`, same reasoning as `days.date`) |
| `counted_toward_streak` | Checkbox |
| `channel_id` | Single line text |
| `message_ts` | Single line text |
| `permalink` | URL |
| `review_count` | Number, integer |
| `views` | Number, integer |
| `likes` | Number, integer |
| `unified_id` | Single line text |
| `reply_message_ts` | Single line text — the `ts` of *our* confirmation reply (not the poster's original message). Lets the reconcile job edit that message in place with fresh stats instead of posting a new one every night. |
| `streak_at_post` | Number, integer — the streak this post advanced to, captured once at submit time so an edited reply stays historically accurate even after the participant's live streak has moved on. |
| `freezes_at_post` | Number, integer — same idea, for freezes remaining. |

**`reviews`**

| field | type |
| --- | --- |
| `review_id` | Autonumber (primary field) |
| `submission_id` | Single line text — stores the `submissions.submission_id` value, not an Airtable link |
| `reviewer_id` | Single line text |
| `reviewed_at` | Date, with time |
| `message_ts` | Single line text |
| `length` | Number, integer |
| `text` | Long text |

3. Get your **base ID**: open the base, click Help → API documentation (or visit
   `airtable.com/api`), the ID starts with `app...`.
4. Create a **personal access token**: [airtable.com/create/tokens](https://airtable.com/create/tokens) →
   add scopes `data.records:read` and `data.records:write` → under Access, add the base you just
   created.

```
AIRTABLE_TOKEN=pat...
AIRTABLE_BASE_ID=app...
```

## 2. Slack app

1. [api.slack.com/apps](https://api.slack.com/apps) → Create New App → From scratch → name it,
   pick your workspace.
2. **Socket Mode** (left sidebar) → make sure **Enable Socket Mode** is OFF. This app uses the
   HTTP Events API (a Request URL), not Socket Mode — if Socket Mode is on, Slack delivers
   events over a websocket instead, your Request URL will still show "Verified" (verification is
   a one-time HTTP challenge, unrelated to Socket Mode), but no real events will ever arrive at
   `/api/slack/events`. This is the single easiest thing to get wrong here.
3. **OAuth & Permissions** → Scopes → Bot Token Scopes, add:
   `chat:write`, `im:write`, `reactions:write`, `app_mentions:read`, `users:read`,
   `users:read.email`, plus, depending on whether your submissions channel is public or private:
   - public channel: `channels:history`, `channels:manage` (the latter for `conversations.invite`)
   - private channel: `groups:history`, `groups:write` (for `conversations.invite` into a
     private channel — `channels:manage` does not cover this)
4. Still on OAuth & Permissions, click **Install to Workspace**, approve. Copy the
   **Bot User OAuth Token** (`xoxb-...`).
5. **Basic Information** → App Credentials → copy the **Signing Secret**.

```
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
```

6. In Slack, create (or pick) a channel for submissions and one for announcements — can be the
   same channel while testing. Invite the bot: `/invite @your-bot-name`.
7. Get each channel's ID: right-click the channel → View channel details → the ID at the
   bottom (starts with `C`).

```
SLACK_SUBMISSION_CHANNEL_ID=C...
SLACK_ANNOUNCE_CHANNEL_ID=C...
```

8. **Don't turn on Event Subscriptions yet** — Slack verifies the Request URL immediately when
   you save it, and that requires the dev server to already be running and reachable. Come back
   to this after section 6 below. When you do, subscribe to `app_mention` and either
   `message.channels` (public submissions channel) or `message.groups` (private) — matching
   whichever scope pair you picked in step 3. Getting the public/private pair mismatched (e.g.
   subscribing to `message.channels` for a private channel) verifies fine and silently delivers
   nothing, same as Socket Mode being on.

## 3. HCA (Hack Club Auth)

`hca.js` matches `hackclub/jamegam`'s `src/lib/server/hca.js` — issuer `auth.hackclub.com`,
`POST /oauth/token` (JSON body), `GET /api/v1/me` for identity. `/api/v1/me` returns `slack_id`
directly (an HCA account is a Hack Club Slack account), so the callback route doesn't need a
separate Slack lookup-by-email.

1. Register an OAuth application with Hack Club Auth (ask in Hack Club's Slack if you don't
   already have a client). Make sure the `openid email name slack_id verification_status` scopes
   are enabled on the app registration — the callback route needs `slack_id` and
   `primary_email`/`first_name`/`last_name` back from `/api/v1/me`.
2. Set its redirect URI to `<PUBLIC_SITE_URL>/api/auth/callback` (see section 5 for what that URL
   is during local dev).

```
HCA_CLIENT_ID=...
HCA_CLIENT_SECRET=...
```

You can skip this section and still test the Slack bot and cron jobs — sign-in is only used by
`/api/auth/*` and the landing page's "Sign in" link.

## 4. Secrets and the rest of `.env`

```
SESSION_SECRET=$(openssl rand -hex 32)
CRON_SECRET=$(openssl rand -hex 32)
```

(On Windows without `openssl`, use `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`.)

`UNIFIED_SOCIALS_TOKEN` — mint a personal token from the unified-socials-db web app's MCP/API
page. `UNIFIED_SOCIALS_API_URL` defaults to `https://unified-socials-db.hackclub.com/api/v1`
(note the `-db` — an earlier version of this app defaulted to the host without it, which
silently 404'd every lookup and made everything look "not tracked yet" regardless of whether the
video was actually tracked).

**Writing** to unified-socials is commented out in `src/lib/server/unified.js` — there's no
confirmed write endpoint for "register this submission" anywhere this build had access to (the
MCP server backing this data is explicitly read-only SQL), so `submitPost` is dead code left in
place for reference rather than a guessed integration that might silently do the wrong thing.

**Reading** views is done by looking a post up by `(platform, video_id)` via
`GET /api/v1/posts?platform=...&platform_post_id=...` — confirmed against unified-socials-db's
own published API docs (`GET /api/v1/<relation>` takes column names as equality filters). If a
video you know is tracked still comes back "not tracked yet", check: the video's `platform`/
`video_id` were captured correctly on the `submissions` row at post time (`src/lib/server/
links.js`'s URL parsing), and that `UNIFIED_SOCIALS_TOKEN` is a valid personal token — an auth
failure surfaces as "unified-socials fetch failed: 401", not silently as "no match". This
integration only matters for `/api/cron/reconcile`'s views pass and `/admin`'s "Check unified-
socials stats" tool (section 9) — safe to leave `UNIFIED_SOCIALS_TOKEN` blank while testing the
rest of the bot.

`MIN_REVIEW_LENGTH` — leave at the default `40` unless you want a different review-length bar.

`ADMIN_SLACK_IDS` — comma-separated Slack user IDs (the `U...` kind, not usernames) allowed to
use `/admin` on the site (section 9 — this is where all debugging tools live; there's no Slack
`debug` command anymore). Leave blank and `/admin` is simply inaccessible — nobody is an admin by
default. Find your own Slack ID via your profile → "Copy member ID".

## 5. Start the app and expose it

```
npm run dev
```

In a second terminal:

```
ngrok http 5173
```

Copy the `https://...ngrok-free.app` forwarding URL into `.env`:

```
PUBLIC_SITE_URL=https://xxxx.ngrok-free.app
```

Restart `npm run dev` so the new env var is picked up.

## 6. Finish the Slack Events subscription

Now that the dev server is reachable at `PUBLIC_SITE_URL`:

1. Double-check **Socket Mode** is still off (step 2 in section 2) — easy to have flipped it on
   by accident while clicking around, and it makes everything below look correct while silently
   delivering nothing.
2. Slack app config → **Event Subscriptions** → toggle on.
3. Request URL: use the FULL path, `<PUBLIC_SITE_URL>/api/slack/events` — not just the bare
   ngrok URL. Slack immediately POSTs a `url_verification` challenge —
   `src/routes/api/slack/events/+server.js` handles it, so this should go green as "Verified"
   within a couple seconds.
4. Subscribe to bot events: `app_mention`, `member_joined_channel` (see section 8's tester),
   and `message.channels` or `message.groups` matching your submissions channel's
   public/private-ness (section 2, step 3).
5. Scroll down and click **Save Changes** on the Event Subscriptions page itself — adding an
   event to the list isn't enough on its own.
6. Reinstall the app to the workspace (OAuth & Permissions page will prompt for this — required
   whenever scopes or subscribed events change).

## 7. Watching external calls

Every outgoing call to Airtable, Slack, HCA, and unified-socials prints a line tagged
`[EXTCALL]` to the terminal running `npm run dev` (method + URL, or method + params for Slack).
Useful for seeing exactly what's being sent while testing. They're grep-tagged on purpose —
`grep -rn '\[EXTCALL\]' src` finds every one of them when you're ready to strip them out.

## 8. Try it

- **Start here**: kick the bot from the submissions channel and re-invite it
  (`/invite @your-bot-name`). If event delivery is wired up correctly end-to-end, it should
  immediately post "👋 I'm in! If you're seeing this, event delivery works." — this is a
  `member_joined_channel` handler in `src/routes/api/slack/events/+server.js` kept specifically
  as a fast way to isolate "is anything reaching the server at all" from "is this specific
  message/link logic broken." If this doesn't fire, don't bother testing links yet — go back
  through section 2 and 6 (Socket Mode, scopes, event subscriptions all need to match, and
  public vs. private channel changes which ones).
- **Sign in first**: visit `<PUBLIC_SITE_URL>/api/auth/login` (needs section 3 configured for
  real) and complete HCA sign-in. **Posts only count if the poster has signed in AND HCA reports
  them verified** — an unsigned-in Slack user posting a link gets a 🔒 reaction and an ephemeral
  telling them to sign in; a signed-in-but-unverified one gets 🔒 and a different ephemeral about
  pending verification. Neither writes a `days` row or advances a streak. If HCA hasn't actually
  verified your test account, use the admin panel's "Force verify" button (section 9) to unblock
  testing without waiting on real HCA verification.
- Post a YouTube/TikTok/Instagram link in the submissions channel → bot should react ✅ and
  reply in-thread with your streak and, if unified-socials already has the video, its stats.
  Reconcile later edits this same message in place with fresh stats rather than posting a new
  one (see section 9).
- Post the same link again the same day → bot reacts 🔁 and still replies in-thread (doesn't
  advance the streak, but doesn't go silent either).
- Post a non-link message → bot reacts ❓ and replies in-thread explaining why.
- Reply in the thread (as a different user, 40+ characters) → bot reacts 👀 and logs a review.
- `@your-bot status` / `@your-bot remind 9` / `@your-bot reviews` in the channel.
- `/leaderboard` (three boards: longest streaks, most total views, highest-viewed individual
  videos), `/gallery` (every submission, sortable by newest or highest views), and
  `/user/<slackId>` (one person's post history) read straight from Airtable — check they render
  once you have a few `participants`/`submissions` rows. Names throughout link to the matching
  `/user/<slackId>` page. The landing page, `/user/<slackId>`, and `/admin` all show a videos-
  posted count and how many of those are currently tracked by unified-socials (i.e. have a
  `unified_id` — set once `refreshViews` gets a match, not necessarily meaning `views` > 0).
- Cron routes are still plain authenticated GETs and work standalone (the `/admin` panel in
  section 9 is another way to trigger the same jobs):

  ```
  curl -H "Authorization: Bearer $CRON_SECRET" $PUBLIC_SITE_URL/api/cron/reconcile
  curl -H "Authorization: Bearer $CRON_SECRET" $PUBLIC_SITE_URL/api/cron/leaderboard
  curl -H "Authorization: Bearer $CRON_SECRET" $PUBLIC_SITE_URL/api/cron/remind
  ```

## 9. Admin panel

`ADMIN_SLACK_IDS` (section 4) gates this — set it before trying it. Everything for debugging
lives here now; there is no Slack `debug` command (removed — it duplicated this page). The
`member_joined_channel` welcome tester from section 8 is unrelated and still lives in the events
route, since it tests something `/admin` can't (whether Slack is delivering events over HTTP at
all).

**`/admin`** on the site has:
- A read-only participant table — edit streak/freezes/status directly in Airtable instead, this
  page deliberately doesn't duplicate that — plus a "Force verify" button per unverified
  participant.
- Buttons to run the three cron jobs on demand. "Run remind" is a pure test blast: DMs everyone
  regardless of reminder hour, whether they've posted, or whether they were already reminded, and
  doesn't mark anyone as reminded (so it can't suppress a real reminder later that day); the real
  hourly cron always respects all of that.
- "Check unified-socials stats" — paste any submitted video's URL to see its live view/like count
  right now, without waiting for the nightly reconcile pass (this replaces the old Slack
  `debug stats` command).
- A "Danger zone" with a **Nuke all data** button — deletes every row in every Airtable table
  (`participants`, `days`, `submissions`, `reviews`). Browser-confirmed before it submits, no
  server-side undo. For wiping test data between runs only.

## 10. Checks

```
npm run check   # svelte-check, must be 0 errors
npm test        # streak.js / verification.js unit tests
```

## 11. Deploying (Vercel)

```
vercel link
vercel env add AIRTABLE_TOKEN
vercel env add AIRTABLE_BASE_ID
# ...repeat for every var in .env.example, production + preview as needed
vercel --prod
```

Set `PUBLIC_SITE_URL` to the real Vercel URL, and point Slack's Event Subscriptions Request URL
and HCA's redirect URI at it instead of the ngrok URL. `vercel.json` already declares the three
cron schedules (`reconcile`, `leaderboard`, `remind`) — Vercel authenticates its own cron calls
with `Authorization: Bearer $CRON_SECRET` automatically as long as `CRON_SECRET` is set in the
project's env vars.
