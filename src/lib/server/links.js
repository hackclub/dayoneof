// Slack wraps every URL in message text as <url> or <url|label>, even a plain pasted link — must
// be unwrapped before matching or the wrapping ends up stored as part of the URL.
const SLACK_LINK = /<(https?:\/\/[^|>\s]+)(?:\|[^>]*)?>/gi;
const URL_REGEX = /https?:\/\/[^\s<>|]+/gi;

// Each pattern rebuilds a canonical URL from the captured id rather than storing what was
// pasted, so query params, tracking junk, and mobile subdomains never end up saved.
const PATTERNS = [
	{
		platform: 'youtube',
		regex:
			/youtube\.com\/(?:shorts|embed|live|v)\/([\w-]{6,})|youtube\.com\/watch\?(?:[^#\s]*&)?v=([\w-]{6,})|youtu\.be\/([\w-]{6,})/i,
		/** @param {RegExpMatchArray} m */
		build(m) {
			const videoId = m[1] ?? m[2] ?? m[3];
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
		regex: /(?:instagram\.com|instagr\.am)\/(?:[\w.]+\/)?(reels?|p|tv)\/([\w-]+)/i,
		/** @param {RegExpMatchArray} m */
		build(m) {
			const kind = m[1].toLowerCase() === 'reels' ? 'reel' : m[1].toLowerCase();
			return { videoId: m[2], url: `https://www.instagram.com/${kind}/${m[2]}/` };
		}
	}
];

// Share links carry no video id, only a redirect to the full URL, so they are resolved first.
const SHORT_LINK =
	/(?:vm|vt)\.tiktok\.com\/|tiktok\.com\/t\/|m\.tiktok\.com\/v\/|instagram\.com\/share\//i;

/** @param {string} url */
async function resolveShortLink(url) {
	try {
		let current = url;
		for (let hop = 0; hop < 5; hop++) {
			const res = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(5000) });
			const location = res.headers.get('location');
			if (!location) break;
			current = new URL(location, current).href;
			if (matchLink(current)) break;
		}
		return current;
	} catch (err) {
		console.error('short link resolve failed', url, err);
		return url;
	}
}

/** @param {string} candidate */
function matchLink(candidate) {
	for (const { platform, regex, build } of PATTERNS) {
		const match = candidate.match(regex);
		if (match) {
			const { videoId, url } = build(match);
			return { url, platform, videoId };
		}
	}
	return null;
}

/** @param {string | undefined} text */
export async function extractLink(text) {
	if (!text) return null;
	const unwrapped = text.replace(SLACK_LINK, '$1');
	const candidates = unwrapped.match(URL_REGEX) ?? [];
	for (const candidate of candidates) {
		const link = matchLink(SHORT_LINK.test(candidate) ? await resolveShortLink(candidate) : candidate);
		if (link) return link;
	}
	return null;
}
