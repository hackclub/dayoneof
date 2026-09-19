import { json } from '@sveltejs/kit';
import { config, TABLES, F } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';
import * as slack from '$lib/server/slack.js';
import { messages } from '$lib/server/messages.js';
import { utcDateString } from '$lib/server/streak.js';

/** @param {string | undefined} tz */
function localHour(tz) {
	return Number(
		new Intl.DateTimeFormat('en-US', { hour: 'numeric', hour12: false, timeZone: tz ?? 'UTC' }).format(new Date())
	);
}

export async function GET({ request }) {
	if (request.headers.get('authorization') !== `Bearer ${config.cronSecret}`) {
		return json({ error: 'unauthorized' }, { status: 401 });
	}

	const today = utcDateString();
	const participants = await airtable.list(TABLES.participants, {
		filterByFormula: `NOT({${F.participants.reminderHour}} = "")`
	});
	const daysToday = await airtable.list(TABLES.days, { filterByFormula: `{${F.days.date}} = "${today}"` });
	const postedToday = new Set(daysToday.map((d) => d.fields[F.days.slackId]));

	let sent = 0;
	for (const participant of participants) {
		const slackId = participant.fields[F.participants.slackId];
		if (postedToday.has(slackId)) continue;
		if (participant.fields[F.participants.lastReminderDay] === today) continue;
		if (localHour(participant.fields[F.participants.tz]) !== participant.fields[F.participants.reminderHour]) continue;

		await slack.dm(slackId, messages.reminder());
		await airtable.update(TABLES.participants, participant.id, {
			[F.participants.lastReminderDay]: today
		});
		sent++;
	}

	return json({ ok: true, sent });
}
