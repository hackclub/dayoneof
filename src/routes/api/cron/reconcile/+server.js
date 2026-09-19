import { json } from '@sveltejs/kit';
import { config, TABLES, F } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';
import * as slack from '$lib/server/slack.js';
import * as unified from '$lib/server/unified.js';
import { messages } from '$lib/server/messages.js';
import { resolveMissedDay } from '$lib/server/streak.js';

function yesterday() {
	const d = new Date();
	d.setUTCDate(d.getUTCDate() - 1);
	return d.toISOString().slice(0, 10);
}

export async function GET({ request }) {
	if (request.headers.get('authorization') !== `Bearer ${config.cronSecret}`) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const date = yesterday();
	const participants = await airtable.list(TABLES.participants, {
		filterByFormula: `OR({${F.participants.status}} = "active", {${F.participants.status}} = "frozen")`
	});
	const days = await airtable.list(TABLES.days, { filterByFormula: `{${F.days.date}} = "${date}"` });
	const postedBySlackId = new Set(days.map((d) => d.fields[F.days.slackId]));

	for (const participant of participants) {
		const slackId = participant.fields[F.participants.slackId];
		if (postedBySlackId.has(slackId)) continue;

		const freezesAvailable = participant.fields[F.participants.streakFreezes] ?? 0;
		const { status, freezesRemaining, broke } = resolveMissedDay(freezesAvailable);

		await airtable.create(TABLES.days, {
			[F.days.slackId]: slackId,
			[F.days.date]: date,
			[F.days.status]: status
		});

		await airtable.update(TABLES.participants, participant.id, {
			[F.participants.streakFreezes]: freezesRemaining,
			[F.participants.status]: broke ? 'broken' : 'frozen',
			[F.participants.currentStreak]: broke ? 0 : participant.fields[F.participants.currentStreak]
		});

		try {
			await slack.dm(slackId, broke ? messages.streakBroken() : messages.dayFrozen(freezesRemaining));
		} catch (err) {
			console.error('reconcile dm failed', err);
		}
	}

	await refreshViews();

	return json({ ok: true, processed: participants.length });
}

async function refreshViews() {
	const submissions = await airtable.list(TABLES.submissions, {
		filterByFormula: `NOT({${F.submissions.unifiedId}} = "")`
	});
	if (submissions.length === 0) return;

	const views = await unified.fetchViews(submissions.map((s) => s.fields[F.submissions.unifiedId]));
	const totalsBySlackId = new Map();

	for (const submission of submissions) {
		const unifiedId = submission.fields[F.submissions.unifiedId];
		const count = views[unifiedId] ?? 0;
		await airtable.update(TABLES.submissions, submission.id, { [F.submissions.views]: count });

		const slackId = submission.fields[F.submissions.slackId];
		totalsBySlackId.set(slackId, (totalsBySlackId.get(slackId) ?? 0) + count);
	}

	for (const [slackId, total] of totalsBySlackId) {
		await airtable.upsert(TABLES.participants, `{${F.participants.slackId}} = "${slackId}"`, {
			[F.participants.totalViews]: total
		});
	}
}
