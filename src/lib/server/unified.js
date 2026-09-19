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
// Confirmed against unified-socials-db's own published API docs (pasted by the user
// 2026-09-19): `GET /api/v1/<relation>` returns rows, filtered by column names passed as
// equality query params, e.g. `GET /api/v1/posts?platform=youtube&platform_post_id=abc123`.
// Base URL is `https://unified-socials-db.hackclub.com/api/v1` (config.js's default — note the
// `-db` in the hostname; an earlier guess had it without, which silently pointed at a
// nonexistent host and made every lookup look like "not tracked yet"). `platform` /
// `platform_post_id` / `views` / `likes` are real columns on `api.posts`, confirmed via the
// unified-socials-db MCP server's `list_columns`.
//
// Still not shown in the docs snippet: the exact JSON envelope (bare array vs. `{ rows: [...] }`
// etc.) — the parsing below tries the common shapes.
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
	const rows = Array.isArray(data) ? data : (data.rows ?? data.posts ?? data.results ?? []);
	const post = rows[0];
	if (!post) return null;
	return { id: post.id, views: post.views ?? 0, likes: post.likes ?? 0 };
}
