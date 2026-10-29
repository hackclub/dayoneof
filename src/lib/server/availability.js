// Whether a submitted video is still up, read from each platform's public pages since
// unified-socials doesn't say. Anything ambiguous (blocked, rate limited, timed out) is null, so a
// flaky check never flags a video on its own.

export const BROWSER_UA =
	'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130 Safari/537.36';
// Instagram only serves its og: tags to link-preview crawlers.
export const CRAWLER_UA = 'facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)';

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

/**
 * @param {{ platform: string, url: string }} video
 * @param {string | null | undefined} youtubePrivacy privacyStatus from the YouTube Data API
 * @returns {Promise<Availability | null>}
 */
export async function checkAvailability({ platform, url }, youtubePrivacy) {
	try {
		if (platform === 'youtube') {
			const res = await get(
				`https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}`,
				BROWSER_UA
			);
			if ([400, 401, 403, 404].includes(res.status)) return 'removed';
			if (!res.ok) return null;
			return youtubePrivacy === 'unlisted' ? 'unlisted' : 'public';
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
