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
			/youtube\.com\/(?:shorts|embed|live|v)\/([\w-]{11})|youtube\.com\/watch\?(?:[^#\s]*&)?v=([\w-]{11})|youtu\.be\/([\w-]{11})/i,
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

// Every distinct video linked in the text, in the order it was linked.
/** @param {string | undefined} text */
export async function extractLinks(text) {
	if (!text) return [];
	const unwrapped = text.replace(SLACK_LINK, '$1');
	const candidates = unwrapped.match(URL_REGEX) ?? [];
	/** @type {Map<string, { url: string, platform: string, videoId: string }>} */
	const links = new Map();
	for (const candidate of candidates) {
		const link = matchLink(SHORT_LINK.test(candidate) ? await resolveShortLink(candidate) : candidate);
		if (link && !links.has(`${link.platform}:${link.videoId}`)) {
			links.set(`${link.platform}:${link.videoId}`, link);
		}
	}
	return [...links.values()];
}

const INSTAGRAM_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const INSTAGRAM_EPOCH_MS = 1314220021721n;

// TikTok and Instagram ids carry their creation time, so age is known before unified-socials is.
/**
 * @param {{ platform: string, videoId: string }} link
 * @returns {string | null}
 */
export function createdAtFromId({ platform, videoId }) {
	let ms = null;
	if (platform === 'tiktok' && /^\d+$/.test(videoId)) {
		ms = (BigInt(videoId) >> 32n) * 1000n;
	} else if (platform === 'instagram' && videoId.length <= 12) {
		let id = 0n;
		for (const char of videoId) {
			const digit = INSTAGRAM_ALPHABET.indexOf(char);
			if (digit < 0) return null;
			id = id * 64n + BigInt(digit);
		}
		ms = (id >> 23n) + INSTAGRAM_EPOCH_MS;
	}
	return ms ? new Date(Number(ms)).toISOString() : null;
}

/** @param {string | undefined} text */
export async function extractLink(text) {
	return (await extractLinks(text))[0] ?? null;
}
