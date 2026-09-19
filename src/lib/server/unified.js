import { config } from './config.js';

function headers() {
	return {
		Authorization: `Bearer ${config.unifiedSocialsToken}`,
		'Content-Type': 'application/json'
	};
}

// --- Writing is disabled. -----------------------------------------------------------------
// IMPLEMENTATION.md calls for "posting each submission" to the unified-socials DB to get an id
// back, but no write endpoint for that exists anywhere this build could confirm — the
// unified-socials-db MCP server backing this data is explicitly read-only SQL over `api.posts`
// et al. Rather than guess a POST shape that might silently fail (or silently hit the wrong
// thing), this is commented out. Un-comment only once a real write endpoint is confirmed.
//
// export async function submitPost({ url, platform, slackId }) {
// 	console.log('[EXTCALL] unified-socials POST /posts');
// 	const res = await fetch(`${config.unifiedSocialsApiUrl}/posts`, {
// 		method: 'POST',
// 		headers: headers(),
// 		body: JSON.stringify({ url, platform, source: 'dayoneof', author_slack_id: slackId })
// 	});
// 	if (!res.ok) throw new Error(`unified-socials submit failed: ${res.status}`);
// 	const data = await res.json();
// 	return data.id;
// }

// --- Reading. -------------------------------------------------------------------------------
// Looks a post up by (platform, platform_post_id) — confirmed via the unified-socials-db MCP
// server's `list_columns api.posts` (2026-09-19): platform_post_id is "the public, URL-carried
// id of the post ... Unique with platform", and `views` is the current best-source view count.
// Both submissions.platform and submissions.video_id are already captured at submit time
// (src/lib/server/links.js), so no id returned from a submit call is needed to look this up.
//
// What is NOT independently confirmed: the exact JSON API route and query-param names below.
// The MCP server's own instructions only say "the same views are available ... at /api/v1" —
// they don't document the REST shape. `${apiUrl}/posts?platform=...&platform_post_id=...` is a
// guess at a PostgREST-style filter convention. Confirm against real API docs before trusting
// this in production; until then, treat every value this returns as unverified.
/**
 * @param {string} platform
 * @param {string} platformPostId
 * @returns {Promise<{ id: number, views: number, likes: number } | null>}
 */
export async function fetchPostByPlatformId(platform, platformPostId) {
	// prints below are tagged [EXTCALL] — grep for that tag to strip them before shipping
	console.log('[EXTCALL] unified-socials GET /posts', platform, platformPostId);
	const params = new URLSearchParams({ platform, platform_post_id: platformPostId });
	const res = await fetch(`${config.unifiedSocialsApiUrl}/posts?${params}`, { headers: headers() });
	if (!res.ok) throw new Error(`unified-socials fetch failed: ${res.status}`);
	const data = await res.json();
	const rows = Array.isArray(data) ? data : (data.posts ?? data.results ?? []);
	const post = rows[0];
	if (!post) return null;
	return { id: post.id, views: post.views ?? 0, likes: post.likes ?? 0 };
}
