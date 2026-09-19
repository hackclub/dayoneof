const PATTERNS = [
	{
		platform: 'youtube',
		regex: /(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([\w-]{6,})/i
	},
	{
		platform: 'tiktok',
		regex: /tiktok\.com\/@[\w.-]+\/video\/(\d+)/i
	},
	{
		platform: 'instagram',
		regex: /instagram\.com\/(?:reel|p)\/([\w-]+)/i
	}
];

const URL_REGEX = /https?:\/\/\S+/gi;

/** @param {string | undefined} text */
export function extractLink(text) {
	if (!text) return null;
	const urls = text.match(URL_REGEX) ?? [];
	for (const url of urls) {
		for (const { platform, regex } of PATTERNS) {
			const match = url.match(regex);
			if (match) return { url, platform, videoId: match[1] };
		}
	}
	return null;
}
