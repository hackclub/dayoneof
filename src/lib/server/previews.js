// A stand-in title and thumbnail read straight from the platform, for the gap before unified-socials
// has archived the video. Platform thumbnails are signed and expire, so the archive's replaces them.
import { get, BROWSER_UA, CRAWLER_UA } from './availability.js';

const OEMBED = {
	youtube: 'https://www.youtube.com/oembed?format=json&url=',
	tiktok: 'https://www.tiktok.com/oembed?url='
};

/**
 * @param {{ platform: string, url: string }} video
 * @returns {Promise<{ title: string, thumbnailUrl: string } | null>}
 */
export async function fetchPreview({ platform, url }) {
	try {
		if (platform === 'youtube' || platform === 'tiktok') {
			const res = await get(`${OEMBED[platform]}${encodeURIComponent(url)}`, BROWSER_UA);
			if (!res.ok) return null;
			const { title, thumbnail_url: thumbnailUrl } = await res.json();
			return {
				title: String(title ?? '').split('\n')[0].trim().slice(0, 100),
				thumbnailUrl: String(thumbnailUrl ?? '')
			};
		}

		if (platform === 'instagram') {
			const res = await get(url, CRAWLER_UA);
			if (!res.ok) return null;
			const image = (await res.text()).match(/property="og:image"\s+content="([^"]+)"/)?.[1];
			return image ? { title: '', thumbnailUrl: image.replace(/&amp;/g, '&') } : null;
		}
	} catch (err) {
		console.error('preview fetch failed', url, err);
	}
	return null;
}
