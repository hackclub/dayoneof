import { config, requireEnv } from './config.js';

function headers() {
	return {
		Authorization: `Bearer ${config.unifiedSocialsToken}`,
		'Content-Type': 'application/json'
	};
}

// Read-only: unified-socials-db exposes SQL views over api.posts and has no write endpoint.
// GET /api/v1/<relation> filters rows by column names as equality query params and answers
// `{ rows, count, limit, offset }` — an untracked post is 200 with `rows: []`, not a 404.
// (platform, platform_post_id) is unique on api.posts, so there is at most one row.
// views/likes are null until some source reports them; title is the full caption, '' if none.
// preview_thumbnail_url is the archive's own thumbnail (archive.hackclub.com/thumb/<id>) and is
// set for ~99% of tracked posts on every platform — some rows store it as http, which the site
// can't embed over https, and the same path answers over https.
/**
 * @param {string} platform
 * @param {string} platformPostId
 * @returns {Promise<{ id: number, views: number, likes: number, title: string, thumbnailUrl: string, publishedAt: string | null } | null>}
 */
export async function fetchPostByPlatformId(platform, platformPostId) {
	const params = new URLSearchParams({ platform, platform_post_id: platformPostId });
	const res = await fetch(`${config.unifiedSocialsApiUrl}/posts?${params}`, { headers: headers() });
	if (!res.ok) throw new Error(`unified-socials fetch failed: ${res.status}`);
	const { rows } = await res.json();
	const post = rows[0];
	if (!post) return null;
	return {
		id: post.id,
		views: post.views ?? 0,
		likes: post.likes ?? 0,
		title: (post.title ?? '').split('\n')[0].trim().slice(0, 100),
		thumbnailUrl: (post.preview_thumbnail_url ?? '').replace(/^http:\/\//, 'https://'),
		publishedAt: post.published_at ?? null
	};
}

// The one write in this codebase, and it spends money: POST /api/v1/tracked-posts pays Arker to
// archive the post and Gemini to watch and code it. Everything about it is deliberate.
//
// - Off unless UNIFIED_SOCIALS_TRACK_POSTS is exactly "true", so merging this cannot spend
//   anything until someone turns it on, and turning it off again is the kill switch.
// - The token needs the tracked_posts:write scope; without it the API answers 403 and no work
//   starts, which makes the scope a second, server-side gate.
// - Idempotent by contract: 201 for a new post, 200 if it was already tracked, same
//   tracked_post_id either way and nothing re-run. So a repeat costs nothing but a request.
// - Never retried. A retry of a paid endpoint that failed halfway is the one thing that could
//   double-charge, and the nightly reconcile re-reads every submission anyway.
// - Never throws. A tracking failure must not cost the poster their streak, so the caller gets
//   null and carries on.
// - Callers must only reach this after a read returned no row: see the submission handler.
/**
 * @param {string} url
 * @returns {Promise<string | null>} the tracked_post_id, or null if nothing was submitted
 */
export async function trackPost(url) {
	if (!config.unifiedSocialsTrackPosts) return null;

	try {
		const token = requireEnv('UNIFIED_SOCIALS_TOKEN', config.unifiedSocialsToken);
		const res = await fetch(`${config.unifiedSocialsApiUrl}/tracked-posts`, {
			method: 'POST',
			headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ url })
		});

		if (!res.ok) {
			console.error('unified-socials track post rejected', url, res.status, await res.text());
			return null;
		}

		const { tracked_post_id: trackedPostId } = await res.json();
		if (!trackedPostId) {
			console.error('unified-socials track post returned no id', url, res.status);
			return null;
		}
		console.log('unified-socials now tracking', url, `(${res.status})`, trackedPostId);
		return String(trackedPostId);
	} catch (err) {
		console.error('unified-socials track post failed', url, err);
		return null;
	}
}
