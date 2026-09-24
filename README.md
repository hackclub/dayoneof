# dayoneof

Post a shortform video every day for a month, keep the streak alive, earn prizes. 

Stack:
- Framework: SvelteKit2 + Svelte 5 (runes), JSDoc
- Airtable DB
- Orchard Hosting
- Slack Bot (events API)
- Hack Club Auth for sign in
- Unified-Socials-DB for metrics

Dev vs Prod:
- Airtable is shared, dev bases suffixed with _dev
- Slack bot separate
- Local testing requires hosting too (i recommend tailscale)

Cron Jobs:
- reconcile: settles every day that ended since each participant's last one (freeze or break), refreshes views and edits bot replies with updates stats
- leaderboard: posts boards to channel at 9pm est
- remind: dms anyone with streak >1 at 8pm local if they haven't made 

Setup:
1. Fill env
2. Create airtable, `run npm run setup:airtable -- (dev or prod)`
3. Start app and expose
4. Create slack app: `npm run setup:slack -- (dev or prod)`
5. Register HCA app
6. Get secrets
7. Deploy to orchard with env and cron jobs (GET)

Flows:

Signing up:
1. Landing page -> email -> HCA
2. DB updated with participant info (name, email, eligibility, tz, pfp)
3. Signed-in visitors are redirected to /home

/home
1. Signed in: How to participate, extra notes if not eligible
2. View wall (newest/most viewed) and leaderboards
3. /user/slackid: individual user posts

Posting:
- threaded reply: ignored
- no link: lists valid platforms
- submissions not open: not started
- not signed into site: reply with sign-in link
- not eligible: reply rejection
- video already submitted: reply rejection
- published over MAX_POST_AGE_DAYS (1) ago: reply rejection
- shorter than 15s: reply rejection
- second post today: recorded but streak not increased, reply with stats
- first post today: recorded, streak +1, reply with stats
- errors: might not have counted

(some of these happen minutes after the submission during a reconcile job)

Streaks:
- day ends at 3am in user tz (est if unknown)
- every 2nd posted day banks a freeze (max 3)
- missed day: streak freeze -1, streak not incremented
- milestones at 2/7/15/25 days are announced (channel + DM), not re-awarded
