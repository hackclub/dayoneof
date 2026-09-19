// Slack wraps every URL in message text as <url> or <url|label>, even a plain pasted link — must
// be unwrapped before matching or the wrapping ends up stored as part of the URL.
const SLACK_LINK = /<(https?:\/\/[^|>\s]+)(?:\|[^>]*)?>/gi;
const URL_REGEX = /https?:\/\/[^\s<>|]+/gi;

// Each pattern rebuilds a canonical URL from the captured id rather than storing what was
// pasted, so query params, tracking junk, and mobile subdomains never end up saved.
const PATTERNS = [
	{
		platform: 'youtube',
		regex: /youtube\.com\/(?:watch\?v=|shorts\/)([\w-]{6,})|youtu\.be\/([\w-]{6,})/i,
		/** @param {RegExpMatchArray} m */
		build(m) {
			const videoId = m[1] ?? m[2];
			return { videoId, url: `https://www.youtube.com/watch?v=${videoId}` };
		}
	},
	{
		platform: 'tiktok',
		regex: /tiktok\.com\/(@[\w.-]+)\/video\/(\d+)/i,
		/** @param {RegExpMatchArray} m */
		build(m) {
			return { videoId: m[2], url: `https://www.tiktok.com/${m[1]}/video/${m[2]}` };
		}
	},
	{
		platform: 'instagram',
		regex: /instagram\.com\/(reel|p)\/([\w-]+)/i,
		/** @param {RegExpMatchArray} m */
		build(m) {
			return { videoId: m[2], url: `https://www.instagram.com/${m[1]}/${m[2]}/` };
		}
	}
];

/** @param {string | undefined} text */
export function extractLink(text) {
	if (!text) return null;
	const unwrapped = text.replace(SLACK_LINK, '$1');
	const candidates = unwrapped.match(URL_REGEX) ?? [];
	for (const candidate of candidates) {
		for (const { platform, regex, build } of PATTERNS) {
			const match = candidate.match(regex);
			if (match) {
				const { videoId, url } = build(match);
				return { url, platform, videoId };
			}
		}
	}
	return null;
}
