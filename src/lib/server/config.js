import { env } from '$env/dynamic/private';
// PUBLIC_SITE_URL starts with the "PUBLIC_" prefix, so $env/dynamic/private silently excludes
// it (it only ever contained undefined) — has to come from the public env module instead, even
// though this app only reads it server-side.
import { env as publicEnv } from '$env/dynamic/public';

export const config = {
	siteUrl: publicEnv.PUBLIC_SITE_URL,
	airtableToken: env.AIRTABLE_TOKEN,
	airtableBaseId: env.AIRTABLE_BASE_ID,
	slackBotToken: env.SLACK_BOT_TOKEN,
	slackSigningSecret: env.SLACK_SIGNING_SECRET,
	submissionChannelId: env.SLACK_SUBMISSION_CHANNEL_ID,
	announceChannelId: env.SLACK_ANNOUNCE_CHANNEL_ID,
	hcaIssuer: (env.HCA_ISSUER || 'https://auth.hackclub.com').replace(/\/$/, ''),
	hcaClientId: env.HCA_CLIENT_ID,
	hcaClientSecret: env.HCA_CLIENT_SECRET,
	hcaScope: env.HCA_SCOPE || 'openid email name slack_id verification_status',
	sessionSecret: env.SESSION_SECRET,
	cronSecret: env.CRON_SECRET,
	unifiedSocialsToken: env.UNIFIED_SOCIALS_TOKEN,
	unifiedSocialsApiUrl: env.UNIFIED_SOCIALS_API_URL ?? 'https://unified-socials-db.hackclub.com/api/v1',
	minReviewLength: Number(env.MIN_REVIEW_LENGTH ?? 40),
	adminSlackIds: (env.ADMIN_SLACK_IDS ?? '')
		.split(',')
		.map((id) => id.trim())
		.filter(Boolean)
};

/** @param {string | undefined} slackId */
export function isAdmin(slackId) {
	return !!slackId && config.adminSlackIds.includes(slackId);
}

/**
 * @param {string} name
 * @param {string | undefined} value
 * @returns {string}
 */
export function requireEnv(name, value) {
	if (!value) throw new Error(`missing required env var: ${name}`);
	return value;
}

export const TABLES = {
	participants: 'participants',
	days: 'days',
	submissions: 'submissions',
	reviews: 'reviews'
};

export const F = {
	participants: {
		slackId: 'slack_id',
		name: 'name',
		email: 'email',
		tz: 'tz',
		status: 'status',
		daysCompleted: 'days_completed',
		streakFreezes: 'streak_freezes',
		daysElapsed: 'days_elapsed',
		currentStreak: 'current_streak',
		verificationStatus: 'verification_status',
		lastMilestone: 'last_milestone',
		reminderHour: 'reminder_hour',
		lastReminderDay: 'last_reminder_day',
		totalViews: 'total_views'
	},
	days: {
		slackId: 'slack_id',
		date: 'date',
		status: 'status'
	},
	submissions: {
		submissionId: 'submission_id',
		slackId: 'slack_id',
		url: 'url',
		platform: 'platform',
		videoId: 'video_id',
		postedAt: 'posted_at',
		day: 'day',
		countedTowardStreak: 'counted_toward_streak',
		channelId: 'channel_id',
		messageTs: 'message_ts',
		permalink: 'permalink',
		reviewCount: 'review_count',
		views: 'views',
		unifiedId: 'unified_id'
	},
	reviews: {
		reviewId: 'review_id',
		submissionId: 'submission_id',
		reviewerId: 'reviewer_id',
		reviewedAt: 'reviewed_at',
		messageTs: 'message_ts',
		length: 'length',
		text: 'text'
	}
};

// A `participants` row with no slack_id (e.g. a blank row added by hand in Airtable, or a stray
// upsert) is not a person — every listing of the whole table should exclude it, otherwise it
// shows up as "<@undefined>" / "undefined" wherever a name or mention gets rendered.
export const PARTICIPANT_HAS_SLACK_ID = `NOT({${F.participants.slackId}} = "")`;

