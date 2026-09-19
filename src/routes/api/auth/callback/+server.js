import { error, redirect } from '@sveltejs/kit';
import { config, requireEnv, TABLES, F } from '$lib/server/config.js';
import { exchangeCode, fetchMe } from '$lib/server/hca.js';
import * as airtable from '$lib/server/airtable.js';
import * as slack from '$lib/server/slack.js';
import { setSessionCookie } from '$lib/server/session.js';

export async function GET({ url, cookies }) {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const expectedState = cookies.get('hca_state');
	cookies.delete('hca_state', { path: '/' });

	if (!code || !state || state !== expectedState) {
		error(400, 'invalid oauth state');
	}

	const redirectUri = `${config.siteUrl}/api/auth/callback`;
	const tokens = await exchangeCode({ code, redirectUri });
	const identity = await fetchMe(tokens.access_token);

	// HCA account == Slack account, so slack_id comes straight back from /api/v1/me —
	// no separate Slack lookup-by-email needed.
	const slackId = identity.slack_id;
	if (!slackId) {
		error(400, 'Your Hack Club Auth account has no linked Slack account.');
	}

	await airtable.upsert(TABLES.participants, `{${F.participants.slackId}} = "${slackId}"`, {
		[F.participants.slackId]: slackId,
		[F.participants.name]: [identity.first_name, identity.last_name].filter(Boolean).join(' '),
		[F.participants.email]: String(identity.primary_email ?? '').toLowerCase()
	});

	try {
		const submissionChannelId = requireEnv('SLACK_SUBMISSION_CHANNEL_ID', config.submissionChannelId);
		await slack.inviteToChannel(submissionChannelId, [slackId]);
	} catch (err) {
		console.error('channel invite failed', err);
	}

	setSessionCookie(cookies, slackId);
	redirect(302, '/');
}
