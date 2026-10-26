// Whether a submitted video is still up, read from each platform's public pages since
// unified-socials doesn't say. Anything ambiguous (blocked, rate limited, timed out) is null, so a
// flaky check never flags a video on its own.

export const BROWSER_UA =
	'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
// Instagram only serves its og: tags to link-preview crawlers.
export const CRAWLER_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';
// A just-published video can take a while to show up in its channel's feed.
const FEED_GRACE_MS = 60 * 60 * 1000;

/** @typedef {'public' | 'unlisted' | 'removed'} Availability */

/**
 * @param {string} url
 * @param {string} userAgent
 */
export function get(url, userAgent) {
	return fetch(url, {
		headers: { 'User-Agent': userAgent },
		redirect: 'manual',
		signal: AbortSignal.timeout(10_000)
	});
}

// Only the newest 15 uploads are in the feed, so a missing video only counts as unlisted when it's
// newer than the oldest one listed, or the feed holds the whole channel.
/**
 * @param {string} videoId
 * @param {string} channelId
 * @param {string} publishedAt
 * @param {Map<string, Promise<string | null>>} feeds
 * @returns {Promise<boolean | null>}
 */
async function isUnlisted(videoId, channelId, publishedAt, feeds) {
	if (Date.now() - Date.parse(publishedAt) < FEED_GRACE_MS) return null;
	if (!feeds.has(channelId)) {
		const url = `https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`;
		feeds.set(
			channelId,
			get(url, BROWSER_UA).then((res) => (res.ok ? res.text() : null))
		);
	}
	const feed = await feeds.get(channelId);
	if (!feed) return null;
	const entries = [...feed.matchAll(/<entry>[\s\S]*?<yt:videoId>([^<]+)<[\s\S]*?<published>([^<]+)</g)];
	if (entries.some(([, id]) => id === videoId)) return false;
	if (entries.length < 15) return true;
	const oldest = Math.min(...entries.map(([, , published]) => Date.parse(published)));
	return Date.parse(publishedAt) > oldest ? true : null;
}

/**
 * @param {{ platform: string, videoId: string, url: string }} video
 * @param {{ channelId?: string | null, publishedAt?: string | null }} known from unified-socials
 * @param {Map<string, Promise<string | null>>} feeds shared across one run's checks
 * @returns {Promise<Availability | null>}
 */
export async function checkAvailability({ platform, videoId, url }, known, feeds) {
	try {
		if (platform === 'youtube') {
			const res = await get(
				`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
				BROWSER_UA
			);
			if ([400, 401, 403, 404].includes(res.status)) return 'removed';
			if (!res.ok) return null;
			if (!known.channelId || !known.publishedAt) return 'public';
			const unlisted = await isUnlisted(videoId, known.channelId, known.publishedAt, feeds);
			return unlisted ? 'unlisted' : 'public';
		}

		if (platform === 'tiktok') {
			const res = await get(url, BROWSER_UA);
			if (res.status === 404) return 'removed';
			if (!res.ok) return null;
			const html = await res.text();
			const status = html.match(/"statusCode":(\d+)/)?.[1];
			if (status === undefined) return null;
			return status !== '0' || html.includes('"privateItem":true') ? 'removed' : 'public';
		}

		if (platform === 'instagram') {
			const res = await get(url, CRAWLER_UA);
			if (res.status === 404) return 'removed';
			if (!res.ok) return null;
			return (await res.text()).includes('property="og:title"') ? 'public' : 'removed';
		}
	} catch (err) {
		console.error('availability check failed', url, err);
	}
	return null;
}
