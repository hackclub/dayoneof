// One video can be posted to several platforms: its first submission is the primary, and every
// other platform's link is a submission pointing back at it. Stats are combined across them.
import { F } from './schema.js';

/** @typedef {import('./airtable.js').AirtableRecord} AirtableRecord */
/** @typedef {import('./messages.js').PostStats} PostStats */

/** @param {AirtableRecord[]} rows */
export function totalViews(rows) {
	return rows.reduce((sum, s) => sum + (s.fields[F.submissions.views] ?? 0), 0);
}

// Keeps the primaries' order. Alternates whose primary isn't in the list are dropped.
/**
 * @param {AirtableRecord[]} submissions
 * @returns {{ primary: AirtableRecord, rows: AirtableRecord[], views: number }[]}
 */
export function groupByVideo(submissions) {
	/** @type {Map<string, AirtableRecord[]>} */
	const alternates = new Map();
	for (const s of submissions) {
		const primaryId = s.fields[F.submissions.primarySubmission];
		if (primaryId) alternates.set(primaryId, [...(alternates.get(primaryId) ?? []), s]);
	}
	return submissions
		.filter((s) => !s.fields[F.submissions.primarySubmission])
		.map((primary) => {
			const rows = [primary, ...(alternates.get(primary.id) ?? [])];
			return { primary, rows, views: totalViews(rows) };
		});
}

// What the site shows for each platform, most viewed first so it's the one shown by default.
/** @param {AirtableRecord[]} rows */
export function videoPlatforms(rows) {
	return rows
		.map((s) => ({
			platform: String(s.fields[F.submissions.platform] ?? ''),
			url: String(s.fields[F.submissions.url] ?? ''),
			title: String(s.fields[F.submissions.title] ?? ''),
			thumbnail: String(s.fields[F.submissions.thumbnailUrl] ?? ''),
			views: Number(s.fields[F.submissions.views] ?? 0)
		}))
		.sort((a, b) => b.views - a.views);
}

/**
 * @param {(number | null)[]} values
 * @returns {number | null}
 */
function sumKnown(values) {
	const known = values.filter((v) => v != null);
	return known.length ? known.reduce((sum, v) => sum + v, 0) : null;
}

/**
 * @param {PostStats[]} posts
 * @returns {PostStats | null}
 */
export function combineStats(posts) {
	if (!posts.length) return null;
	return {
		views: posts.reduce((sum, p) => sum + p.views, 0),
		likes: posts.reduce((sum, p) => sum + p.likes, 0),
		shares: sumKnown(posts.map((p) => p.shares)),
		watchHours: sumKnown(posts.map((p) => p.watchHours)),
		watchHoursEstimated: posts.some((p) => p.watchHoursEstimated)
	};
}
