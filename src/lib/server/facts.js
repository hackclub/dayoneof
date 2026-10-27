// Publish time and length straight from the platform, until unified-socials has captured the post.
import { config } from './config.js';
import { fetchPostByPlatformId } from './unified.js';
import { get, BROWSER_UA } from './availability.js';
import { createdAtFromId } from './links.js';

/** @typedef {{ publishedAt: string | null, durationSeconds: number | null }} VideoFacts */

/** @param {string} iso e.g. PT1M2S */
function isoDurationSeconds(iso) {
	const m = iso.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/);
	if (!m) return null;
	const [d, h, min, s] = m.slice(1).map((v) => Number(v ?? 0));
	const total = ((d * 24 + h) * 60 + min) * 60 + s;
	return total > 0 ? total : null;
}

/**
 * @param {string} videoId
 * @returns {Promise<VideoFacts>}
 */
async function youtubeFacts(videoId) {
	if (!config.youtubeApiKey) return { publishedAt: null, durationSeconds: null };
	const params = new URLSearchParams({
		part: 'snippet,contentDetails',
		id: videoId,
		fields: 'items(snippet/publishedAt,contentDetails/duration)',
		key: config.youtubeApiKey
	});
	const res = await fetch(`https://www.googleapis.com/youtube/v3/videos?${params}`, {
		signal: AbortSignal.timeout(10_000)
	});
	if (!res.ok) throw new Error(`youtube data api failed: ${res.status}`);
	const item = (await res.json()).items?.[0];
	return {
		publishedAt: item?.snippet?.publishedAt ?? null,
		durationSeconds: item ? isoDurationSeconds(item.contentDetails?.duration ?? '') : null
	};
}

/** @param {string} url */
async function tiktokDuration(url) {
	const res = await get(url, BROWSER_UA);
	if (!res.ok) return null;
	const data = (await res.text()).match(
		/<script id="__UNIVERSAL_DATA_FOR_REHYDRATION__"[^>]*>([\s\S]*?)<\/script>/
	)?.[1];
	if (!data) return null;
	const duration =
		JSON.parse(data)?.__DEFAULT_SCOPE__?.['webapp.video-detail']?.itemInfo?.itemStruct?.video
			?.duration;
	return typeof duration === 'number' && duration > 0 ? duration : null;
}

// Instagram has no public length source, so a reel waits on unified-socials.
/**
 * @param {{ platform: string, videoId: string, url: string }} link
 * @returns {Promise<VideoFacts>}
 */
async function fetchFacts(link) {
	if (link.platform === 'youtube') {
		return youtubeFacts(link.videoId).catch((err) => {
			console.error('youtube data api lookup failed', link.url, err);
			return { publishedAt: null, durationSeconds: null };
		});
	}
	const durationSeconds =
		link.platform === 'tiktok'
			? await tiktokDuration(link.url).catch((err) => {
					console.error('tiktok length lookup failed', link.url, err);
					return null;
				})
			: null;
	return { publishedAt: createdAtFromId(link), durationSeconds };
}

/** @param {{ platform: string, videoId: string, url: string }} link */
export async function lookupVideo(link) {
	const [stats, read] = await Promise.all([
		fetchPostByPlatformId(link.platform, link.videoId).catch((err) => {
			console.error('unified-socials lookup failed', link.url, err);
			return null;
		}),
		fetchFacts(link)
	]);
	/** @type {VideoFacts} */
	const facts = {
		publishedAt: stats?.publishedAt ?? read.publishedAt,
		durationSeconds: stats?.durationSeconds ?? read.durationSeconds
	};
	return { stats, facts };
}
