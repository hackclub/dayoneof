import { error, json } from '@sveltejs/kit';
import { isReviewer, TABLES, F } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';
import * as slack from '$lib/server/slack.js';
import { fetchPostByPlatformId } from '$lib/server/unified.js';

// Slack's <url|label> and <@U123> markup, shown as plain text.
/** @param {string} text */
function plain(text) {
	return text
		.replace(/<(https?:[^|>]+)\|([^>]+)>/g, '$2')
		.replace(/<(https?:[^>]+)>/g, '$1')
		.replace(/<@(\w+)>/g, '@$1')
		.replace(/&amp;/g, '&')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>');
}

export async function GET({ url, locals }) {
	if (!isReviewer(locals.session?.slackId)) error(403, "You're not a reviewer.");
	const submission = await airtable.get(TABLES.submissions, String(url.searchParams.get('id')));
	const f = submission.fields;
	const [post, message] = await Promise.all([
		fetchPostByPlatformId(f[F.submissions.platform], f[F.submissions.videoId]).catch(() => null),
		slack.getMessage(f[F.submissions.channelId], f[F.submissions.messageTs]).catch(() => null)
	]);
	return json({ caption: post?.caption ?? '', note: plain(message?.text ?? '') });
}
