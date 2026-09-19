// Slack wraps every URL in message text as <url> or <url|label> before it reaches the Events
// API — even a link the user just pasted as plain text, not authored with markdown. Left
// unstripped, a greedy \S+ match swallows the wrapping straight into the stored URL (and for
// long URLs, the label half is Slack's own "…"-truncated display text, encoded).
const SLACK_LINK = /<(https?:\/\/[^|>\s]+)(?:\|[^>]*)?>/gi;

// Stops at whitespace and at Slack's own delimiter chars, so even an unwrapped straggler can't
// bleed into a neighboring `<...>` link.
const URL_REGEX = /https?:\/\/[^\s<>|]+/gi;

// Each pattern both recognizes a platform's link and rebuilds a canonical URL from the captured
// pieces — never the originally-pasted URL — so stray query params, tracking junk, mobile
// subdomains, and Slack's own wrapping never end up stored.
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
