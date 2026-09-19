import { json } from '@sveltejs/kit';
import { config, requireEnv, TABLES, F } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';
import * as slack from '$lib/server/slack.js';

export async function GET({ request }) {
	if (request.headers.get('authorization') !== `Bearer ${config.cronSecret}`) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const participants = await airtable.list(TABLES.participants);

	const byStreak = [...participants]
		.sort((a, b) => {
			const streakDiff = (b.fields[F.participants.currentStreak] ?? 0) - (a.fields[F.participants.currentStreak] ?? 0);
			if (streakDiff !== 0) return streakDiff;
			return (a.fields[F.participants.streakFreezes] ?? 0) - (b.fields[F.participants.streakFreezes] ?? 0);
		})
		.slice(0, 10);

	const byViews = [...participants]
		.sort((a, b) => (b.fields[F.participants.totalViews] ?? 0) - (a.fields[F.participants.totalViews] ?? 0))
		.slice(0, 10);

	const streakLines = byStreak
		.map((p, i) => `${i + 1}. <@${p.fields[F.participants.slackId]}> — ${p.fields[F.participants.currentStreak] ?? 0} days`)
		.join('\n');

	const viewLines = byViews
		.map((p, i) => `${i + 1}. <@${p.fields[F.participants.slackId]}> — ${p.fields[F.participants.totalViews] ?? 0} views`)
		.join('\n');

	const announceChannelId = requireEnv('SLACK_ANNOUNCE_CHANNEL_ID', config.announceChannelId);
	await slack.postMessage(announceChannelId, `*Longest active streaks*\n${streakLines}`);
	await slack.postMessage(announceChannelId, `*Most total views*\n${viewLines}`);

	return json({ ok: true });
}
