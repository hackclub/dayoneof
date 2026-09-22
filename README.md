# dayoneof

Post a shortform video every day for a month, keep the streak alive, earn prizes. A Hack Club
YSWS: a SvelteKit site with the Slack bot living inside it as a route, backed by Airtable.

```
npm install
cp .env.example .env
npm run dev
```

[INFRASTRUCTURE.md](INFRASTRUCTURE.md) covers the stack, the data model, the bot, the cron jobs
and setup from scratch. [AGENTS.md](AGENTS.md) covers the code and commit style.

```
npm run check    # svelte-check, must stay at 0 errors
npm test         # node:test unit tests
```
