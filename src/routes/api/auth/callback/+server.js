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
	const expectedEmail = cookies.get('hca_email');
	const reauthed = cookies.get('hca_reauth') === '1';
	cookies.delete('hca_state', { path: '/' });
	cookies.delete('hca_email', { path: '/' });
	cookies.delete('hca_reauth', { path: '/' });

	if (!code || !state || state !== expectedState) {
		error(400, 'That sign-in link expired or was already used. Head back and sign in again.');
	}

	const redirectUri = `${config.siteUrl}/api/auth/callback`;
	const tokens = await exchangeCode({ code, redirectUri });
	const identity = await fetchMe(tokens.access_token);

	const email = String(identity.primary_email ?? '').toLowerCase();
	if (expectedEmail && email !== expectedEmail) {
		// HCA reused a different signed-in account, so send them back to sign in as the one they typed.
		if (!reauthed) {
			redirect(302, `/api/auth/login?${new URLSearchParams({ email: expectedEmail, reauth: '1' })}`);
		}
		error(403, `You signed in as ${email}, not ${expectedEmail}. Head back and try again.`);
	}

	const slackId = identity.slack_id;
	if (!slackId) {
		error(
			400,
			"Your Hack Club Auth account isn't linked to a Slack account yet, so we can't track your posts."
		);
	}

	const [slackUser, existing] = await Promise.all([
		slack.usersInfo(slackId).catch((err) => {
			console.error('users.info failed during sign-in, continuing without tz', err);
			return null;
		}),
		airtable.find(TABLES.participants, airtable.eq(F.participants.slackId, slackId))
	]);
	const tz = slackUser?.tz;
	const slackName = slackUser?.profile?.display_name || slackUser?.profile?.real_name;
	const avatar = slackUser?.profile?.image_192 || slackUser?.profile?.image_72;

	const fields = {
		[F.participants.slackId]: slackId,
		[F.participants.name]:
			slackName || [identity.first_name, identity.last_name].filter(Boolean).join(' '),
		[F.participants.email]: email,
		[F.participants.verificationStatus]: identity.verification_status ?? 'needs_submission',
		[F.participants.yswsEligible]: identity.ysws_eligible === true,
		...(tz ? { [F.participants.tz]: tz } : {}),
		...(avatar ? { [F.participants.avatar]: avatar } : {})
	};
	if (existing) await airtable.update(TABLES.participants, existing.id, fields);
	else await airtable.create(TABLES.participants, fields);

	const submissionChannelId = requireEnv('SLACK_SUBMISSION_CHANNEL_ID', config.submissionChannelId);
	slack
		.inviteToChannel(submissionChannelId, [slackId])
		.catch((err) => console.error('channel invite failed', err));

	setSessionCookie(cookies, slackId);
	redirect(302, '/home');
}
