import { config } from './config.js';

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
 * @returns {Promise<{ id: number, views: number, likes: number, title: string, thumbnailUrl: string } | null>}
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
		thumbnailUrl: (post.preview_thumbnail_url ?? '').replace(/^http:\/\//, 'https://')
	};
}
