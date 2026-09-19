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
| `unified_id` | Single line text |

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
2. **OAuth & Permissions** → Scopes → Bot Token Scopes, add:
   `channels:history`, `chat:write`, `im:write`, `reactions:write`, `app_mentions:read`,
   `users:read`, `users:read.email`, `channels:manage` (needed for `conversations.invite`).
3. Still on OAuth & Permissions, click **Install to Workspace**, approve. Copy the
   **Bot User OAuth Token** (`xoxb-...`).
4. **Basic Information** → App Credentials → copy the **Signing Secret**.

```
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
```

5. In Slack, create (or pick) a channel for submissions and one for announcements — can be the
   same channel while testing. Invite the bot: `/invite @your-bot-name`.
6. Get each channel's ID: right-click the channel → View channel details → the ID at the
   bottom (starts with `C`).

```
SLACK_SUBMISSION_CHANNEL_ID=C...
SLACK_ANNOUNCE_CHANNEL_ID=C...
```

7. **Don't turn on Event Subscriptions yet** — Slack verifies the Request URL immediately when
   you save it, and that requires the dev server to already be running and reachable. Come back
   to this after section 6 below.

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
page. `UNIFIED_SOCIALS_API_URL` defaults to a placeholder in `config.js`
(`https://unified-socials.hackclub.com/api/v1`).

**Writing** to unified-socials is commented out in `src/lib/server/unified.js` — there's no
confirmed write endpoint for "register this submission" anywhere this build had access to (the
MCP server backing this data is explicitly read-only SQL), so `submitPost` is dead code left in
place for reference rather than a guessed integration that might silently do the wrong thing.

**Reading** views is done by looking a post up by `(platform, video_id)` — those two column
names (`platform`, `platform_post_id`) are confirmed against the real `api.posts` schema via the
unified-socials-db MCP server's `list_columns`. What's *not* confirmed is the JSON API's actual
route/query-param shape (`GET /posts?platform=...&platform_post_id=...` is a guess at a
PostgREST-style filter) — check that against real API docs before trusting the nightly views
refresh. This integration only matters for `/api/cron/reconcile`'s views pass — safe to leave
`UNIFIED_SOCIALS_TOKEN` blank while testing the bot itself.

`MIN_REVIEW_LENGTH` — leave at the default `40` unless you want a different review-length bar.

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

1. Slack app config → **Event Subscriptions** → toggle on.
2. Request URL: `<PUBLIC_SITE_URL>/api/slack/events`. Slack immediately POSTs a
   `url_verification` challenge — `src/routes/api/slack/events/+server.js` handles it, so this
   should go green as "Verified" within a couple seconds.
3. Subscribe to bot events: `message.channels`, `app_mention`.
4. Save changes, then reinstall the app to the workspace if it asks (scope/event changes
   require reinstalling).

## 7. Watching external calls

Every outgoing call to Airtable, Slack, HCA, and unified-socials prints a line tagged
`[EXTCALL]` to the terminal running `npm run dev` (method + URL, or method + params for Slack).
Useful for seeing exactly what's being sent while testing. They're grep-tagged on purpose —
`grep -rn '\[EXTCALL\]' src` finds every one of them when you're ready to strip them out.

## 8. Try it

- Post a YouTube/TikTok/Instagram link in the submissions channel → bot should react ✅ and
  reply in-thread with your streak.
- Post a non-link message → bot reacts ❓ and sends you an ephemeral explanation.
- Reply in the thread (as a different user, 40+ characters) → bot reacts 👀 and logs a review.
- `@your-bot status` / `@your-bot remind 9` / `@your-bot reviews` in the channel.
- Cron routes are plain authenticated GETs, trigger them manually:

  ```
  curl -H "Authorization: Bearer $CRON_SECRET" $PUBLIC_SITE_URL/api/cron/reconcile
  curl -H "Authorization: Bearer $CRON_SECRET" $PUBLIC_SITE_URL/api/cron/leaderboard
  curl -H "Authorization: Bearer $CRON_SECRET" $PUBLIC_SITE_URL/api/cron/remind
  ```

- Sign-in: visit `<PUBLIC_SITE_URL>/api/auth/login` (needs step 3 configured for real).
- `/leaderboard` and `/gallery` read straight from Airtable — check they render once you have a
  few `participants`/`submissions` rows.

## 9. Checks

```
npm run check   # svelte-check, must be 0 errors
npm test        # streak.js unit tests
```

## 10. Deploying (Vercel)

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
