// Addresses live in their own table, matched to participants by slack_id, so the sensitive fields
// are never read by the public pages or anything that lists participants.
import { SHIPPING_TABLE, F } from './config.js';
import * as airtable from './airtable.js';

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

