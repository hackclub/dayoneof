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

	const slackId = identity.slack_id;
	if (!slackId) {
		error(400, 'Your Hack Club Auth account has no linked Slack account.');
	}

	let tz;
	let slackName;
	try {
		const slackUser = await slack.usersInfo(slackId);
		tz = slackUser?.tz;
		slackName = slackUser?.profile?.display_name || slackUser?.profile?.real_name;
	} catch (err) {
		console.error('users.info failed during sign-in, continuing without tz', err);
	}

	await airtable.upsert(TABLES.participants, `{${F.participants.slackId}} = "${slackId}"`, {
		[F.participants.slackId]: slackId,
		[F.participants.name]:
			slackName || [identity.first_name, identity.last_name].filter(Boolean).join(' '),
		[F.participants.email]: String(identity.primary_email ?? '').toLowerCase(),
		[F.participants.verificationStatus]: identity.verification_status ?? 'needs_submission',
		...(tz ? { [F.participants.tz]: tz } : {})
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
