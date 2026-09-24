import { json } from '@sveltejs/kit';
import { TABLES, F } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';
import * as slack from '$lib/server/slack.js';
import { messages } from '$lib/server/messages.js';

/**
 * @typedef {{
 *   type: string,
 *   user: { id: string },
 *   channel?: { id: string },
 *   message?: { ts: string },
 *   actions?: { action_id: string, value: string }[]
 * }} SlackInteraction
 */

/** @param {SlackInteraction} payload */
async function toggleReminders(payload) {
	const remindersOn = payload.actions?.[0]?.value === 'on';
	const participant = await airtable.find(
		TABLES.participants,
		airtable.eq(F.participants.slackId, payload.user.id)
	);
	if (!participant) return;

	await airtable.update(TABLES.participants, participant.id, {
		[F.participants.remindersOff]: !remindersOn
	});
	if (payload.channel && payload.message) {
		const text = messages.reminderToggled(remindersOn);
		await slack.updateMessage(
			payload.channel.id,
			payload.message.ts,
			text,
			messages.reminderBlocks(text, remindersOn)
		);
	}
}

export async function POST({ request }) {
	const rawBody = await request.text();
	const signature = request.headers.get('x-slack-signature');
	const timestamp = request.headers.get('x-slack-request-timestamp');

	if (!slack.verifySignature(rawBody, timestamp, signature)) {
		return json({ error: 'invalid signature' }, { status: 401 });
	}

	/** @type {SlackInteraction} */
	const payload = JSON.parse(new URLSearchParams(rawBody).get('payload') ?? '{}');

	if (payload.type === 'block_actions' && payload.actions?.[0]?.action_id === 'toggle_reminders') {
		try {
			await toggleReminders(payload);
		} catch (err) {
			console.error('toggling reminders failed', payload.user?.id, err);
		}
	}

	return new Response(null, { status: 200 });
}
