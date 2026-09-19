import { error, redirect } from '@sveltejs/kit';
import { config, requireEnv, TABLES, F } from '$lib/server/config.js';
import { exchangeCode, getUserInfo } from '$lib/server/hca.js';
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
	const tokens = await exchangeCode(code, redirectUri);
	const profile = await getUserInfo(tokens.access_token);

	const slackUser = await slack.usersLookupByEmail(profile.email);

	await airtable.upsert(TABLES.participants, `{${F.participants.slackId}} = "${slackUser.id}"`, {
		[F.participants.slackId]: slackUser.id,
		[F.participants.name]: profile.name,
		[F.participants.email]: profile.email,
		[F.participants.tz]: slackUser.tz
	});

	try {
		const submissionChannelId = requireEnv('SLACK_SUBMISSION_CHANNEL_ID', config.submissionChannelId);
		await slack.inviteToChannel(submissionChannelId, [slackUser.id]);
	} catch (err) {
		console.error('channel invite failed', err);
	}

	setSessionCookie(cookies, slackUser.id);
	redirect(302, '/');
}
