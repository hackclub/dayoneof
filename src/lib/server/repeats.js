// Spots one video submitted again on a later day under a new link, usually re-uploaded to another
// platform. Calibrated on 60 real cross-posts against 150 different videos from the same accounts:
// length within 1.5s plus screenplay overlap of 0.15 caught 59 of 60, with 3 of 150 false hits.
import { F } from './schema.js';

/** @typedef {import('./airtable.js').AirtableRecord} AirtableRecord */

export const MAX_DURATION_GAP = 1.5;
const MIN_SCREENPLAY_OVERLAP = 0.15;
const MIN_CAPTION_KEY = 12;
// Screenplays land hours after a post, so recent posts are re-checked until they have one.
const RECHECK_DAYS = 3;

const STOP_WORDS = new Set(
	'the and you are was for with that this his her their our your they she int ext day night text screen narrator voiceover cut'.split(
		' '
	)
);

/** @param {string} title */
export function captionKey(title) {
	return title.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 40);
}

/** @param {string} screenplay */
function screenplayWords(screenplay) {
	const words = screenplay
		.toLowerCase()
		.replace(/\[\d+:\d+\]/g, '')
		.match(/[a-z0-9']+/g);
	return new Set((words ?? []).filter((w) => w.length > 2 && !STOP_WORDS.has(w)));
}

// Word-set Jaccard: two write-ups of one video share most of their nouns even when phrased apart.
/**
 * @param {string} a
 * @param {string} b
 */
export function screenplayOverlap(a, b) {
	const x = screenplayWords(a);
	const y = screenplayWords(b);
	let shared = 0;
	for (const w of x) if (y.has(w)) shared++;
	return shared / Math.max(1, x.size + y.size - shared);
}

/**
 * @param {AirtableRecord[]} submissions live rows
 * @param {string} today YYYY-MM-DD
 * @param {(unifiedId: string) => Promise<string | null>} getScreenplay
 * @returns {Promise<Map<string, { of: AirtableRecord, reason: string }>>} keyed by the later row's id
 */
export async function findRepeats(submissions, today, getScreenplay) {
	/** @type {Map<string, Promise<string | null>>} */
	const screenplays = new Map();
	/** @param {AirtableRecord} s */
	const screenplay = (s) => {
		const id = s.fields[F.submissions.unifiedId];
		if (!id) return Promise.resolve(null);
		if (!screenplays.has(id)) {
			screenplays.set(
				id,
				getScreenplay(id).catch((err) => {
					console.error('screenplay fetch failed', id, err);
					return null;
				})
			);
		}
		return /** @type {Promise<string | null>} */ (screenplays.get(id));
	};
	/** @param {AirtableRecord} s */
	const videoOf = (s) => s.fields[F.submissions.primarySubmission] || s.id;
	const recheckFrom = new Date(`${today}T00:00:00Z`);
	recheckFrom.setUTCDate(recheckFrom.getUTCDate() - RECHECK_DAYS);
	const recent = recheckFrom.toISOString().slice(0, 10);

	/** @type {Map<string, AirtableRecord[]>} */
	const bySlackId = new Map();
	for (const s of submissions) {
		const slackId = s.fields[F.submissions.slackId];
		bySlackId.set(slackId, [...(bySlackId.get(slackId) ?? []), s]);
	}

	/** @type {Map<string, { of: AirtableRecord, reason: string }>} */
	const repeats = new Map();
	for (const rows of bySlackId.values()) {
		for (const later of rows) {
			const f = later.fields;
			if (f[F.submissions.repeatReason] || !(f[F.submissions.day] >= recent)) continue;

			for (const earlier of rows) {
				const e = earlier.fields;
				if (!(e[F.submissions.day] < f[F.submissions.day]) || videoOf(earlier) === videoOf(later)) {
					continue;
				}

				const a = f[F.submissions.durationSeconds];
				const b = e[F.submissions.durationSeconds];
				const known = typeof a === 'number' && typeof b === 'number';
				if (known && Math.abs(a - b) > MAX_DURATION_GAP) continue;

				// Hashtag-only captions get reused, so a known length has to agree too.
				const caption = captionKey(f[F.submissions.title] ?? '');
				if (caption.length >= MIN_CAPTION_KEY && caption === captionKey(e[F.submissions.title] ?? '')) {
					repeats.set(later.id, { of: earlier, reason: 'same caption' });
					break;
				}
				if (!known) continue;
				const [x, y] = await Promise.all([screenplay(later), screenplay(earlier)]);
				if (!x || !y) continue;
				const overlap = screenplayOverlap(x, y);
				if (overlap >= MIN_SCREENPLAY_OVERLAP) {
					repeats.set(later.id, {
						of: earlier,
						reason: `same length, ${Math.round(overlap * 100)}% screenplay overlap`
					});
					break;
				}
			}
		}
	}
	return repeats;
}
