import { config } from './config.js';

function headers() {
	return {
		Authorization: `Bearer ${config.unifiedSocialsToken}`,
		'Content-Type': 'application/json'
	};
}

/** @param {{ url: string, platform: string, slackId: string }} post */
export async function submitPost({ url, platform, slackId }) {
	const res = await fetch(`${config.unifiedSocialsApiUrl}/posts`, {
		method: 'POST',
		headers: headers(),
		body: JSON.stringify({ url, platform, source: 'dayoneof', author_slack_id: slackId })
	});
	if (!res.ok) throw new Error(`unified-socials submit failed: ${res.status}`);
	const data = await res.json();
	return data.id;
}

/**
 * @param {string[]} unifiedIds
 * @returns {Promise<Record<string, number>>}
 */
export async function fetchViews(unifiedIds) {
	if (unifiedIds.length === 0) return {};
	const params = new URLSearchParams({ ids: unifiedIds.join(',') });
	const res = await fetch(`${config.unifiedSocialsApiUrl}/posts?${params}`, { headers: headers() });
	if (!res.ok) throw new Error(`unified-socials fetch failed: ${res.status}`);
	const data = await res.json();
	/** @type {Record<string, number>} */
	const views = {};
	for (const post of data.posts ?? []) views[post.id] = post.views ?? 0;
	return views;
}
