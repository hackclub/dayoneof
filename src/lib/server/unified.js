import { config } from './config.js';

function headers() {
	return {
		Authorization: `Bearer ${config.unifiedSocialsToken}`,
		'Content-Type': 'application/json'
	};
}

// Writing is disabled — no confirmed write endpoint exists (unified-socials-db is read-only SQL
// over api.posts). Left as reference; do not enable without explicit approval.
//
// export async function submitPost({ url, platform, slackId }) {
// 	const res = await fetch(`${config.unifiedSocialsApiUrl}/posts`, {
// 		method: 'POST',
// 		headers: headers(),
// 		body: JSON.stringify({ url, platform, source: 'dayoneof', author_slack_id: slackId })
// 	});
// 	if (!res.ok) throw new Error(`unified-socials submit failed: ${res.status}`);
// 	const data = await res.json();
// 	return data.id;
// }

// GET /api/v1/<relation> filters rows by column names as equality query params.
/**
 * @param {string} platform
 * @param {string} platformPostId
 * @returns {Promise<{ id: number, views: number, likes: number, title: string } | null>}
 */
export async function fetchPostByPlatformId(platform, platformPostId) {
	console.log('[EXTCALL] unified-socials GET /posts', platform, platformPostId);
	const params = new URLSearchParams({ platform, platform_post_id: platformPostId });
	const res = await fetch(`${config.unifiedSocialsApiUrl}/posts?${params}`, { headers: headers() });
	if (!res.ok) throw new Error(`unified-socials fetch failed: ${res.status}`);
	const data = await res.json();
	const rows = Array.isArray(data) ? data : (data.rows ?? data.posts ?? data.results ?? []);
	const post = rows[0];
	if (!post) return null;
	return {
		id: post.id,
		views: post.views ?? 0,
		likes: post.likes ?? 0,
		title: (post.title ?? '').split('\n')[0].trim().slice(0, 100)
	};
}
