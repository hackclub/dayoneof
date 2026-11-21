// Addresses live in their own table, matched to participants by slack_id, so the sensitive fields
// are never read by the public pages or anything that lists participants.
import { SHIPPING_TABLE, TABLES, F, PARTICIPANT_HAS_SLACK_ID } from './config.js';
import * as airtable from './airtable.js';
import { prizesUnlocked } from './streak.js';

/** @param {string} slackId */
export function findShipping(slackId) {
	return airtable.find(SHIPPING_TABLE, airtable.eq(F.shipping.slackId, slackId));
}

/**
 * @param {string} slackId
 * @param {Record<string, any>} fields
 */
export async function saveShipping(slackId, fields) {
	const record = {
		...fields,
		[F.shipping.slackId]: slackId,
		[F.shipping.submittedAt]: new Date().toISOString()
	};
	const existing = await findShipping(slackId);
	if (existing) await airtable.update(SHIPPING_TABLE, existing.id, record);
	else await airtable.create(SHIPPING_TABLE, record);
}

// Keeps eligible_prizes in step with last_milestone so the table can be worked from directly.
export async function syncEligiblePrizes() {
	const [participants, shipping] = await Promise.all([
		airtable.list(TABLES.participants, { filterByFormula: PARTICIPANT_HAS_SLACK_ID }),
		airtable.list(SHIPPING_TABLE)
	]);
	const milestones = new Map(
		participants.map((p) => [p.fields[F.participants.slackId], p.fields[F.participants.lastMilestone]])
	);
	let updated = 0;
	for (const row of shipping) {
		const eligible = prizesUnlocked(milestones.get(row.fields[F.shipping.slackId]));
		if ((row.fields[F.shipping.eligiblePrizes] ?? []).join() === eligible.join()) continue;
		await airtable.update(SHIPPING_TABLE, row.id, { [F.shipping.eligiblePrizes]: eligible });
		updated++;
	}
	return updated;
}
