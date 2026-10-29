// YouTube counts and privacy straight from the Data API, 50 videos per request (1 quota unit).
import { config, requireEnv } from './config.js';

const BATCH_SIZE = 50;

/** @typedef {{ views: number, likes: number | null, privacy: string | null }} YoutubeCounts */

/**
 * @param {string[]} videoIds
 * @returns {Promise<Map<string, YoutubeCounts>>}
 */
export async function fetchCounts(videoIds) {
	const key = requireEnv('YOUTUBE_API_KEY', config.youtubeApiKey);
	const ids = [...new Set(videoIds)];
	/** @type {Map<string, YoutubeCounts>} */
	const counts = new Map();
	for (let i = 0; i < ids.length; i += BATCH_SIZE) {
		const params = new URLSearchParams({
			part: 'statistics,status',
			id: ids.slice(i, i + BATCH_SIZE).join(','),
			fields: 'items(id,statistics(viewCount,likeCount),status(privacyStatus))',
			key
		});
		const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, {
			signal: AbortSignal.timeout(10_000)
		});
		if (!res.ok) throw new Error(`youtube data api failed: ${res.status}`);
		for (const item of (await res.json()).items ?? []) {
			const { viewCount, likeCount } = item.statistics ?? {};
			// Hidden like counts come back missing, not zero.
			counts.set(item.id, {
				views: Number(viewCount ?? 0),
				likes: likeCount == null ? null : Number(likeCount),
				privacy: item.status?.privacyStatus ?? null
			});
		}
	}
	return counts;
}
