import { env } from '$env/dynamic/private';

export const config = {
	siteUrl: env.PUBLIC_SITE_URL,
	airtableToken: env.AIRTABLE_TOKEN,
	airtableBaseId: env.AIRTABLE_BASE_ID,
	slackBotToken: env.SLACK_BOT_TOKEN,
	slackSigningSecret: env.SLACK_SIGNING_SECRET,
	submissionChannelId: env.SLACK_SUBMISSION_CHANNEL_ID,
	announceChannelId: env.SLACK_ANNOUNCE_CHANNEL_ID,
	hcaClientId: env.HCA_CLIENT_ID,
	hcaClientSecret: env.HCA_CLIENT_SECRET,
	sessionSecret: env.SESSION_SECRET,
	cronSecret: env.CRON_SECRET,
	unifiedSocialsToken: env.UNIFIED_SOCIALS_TOKEN,
	unifiedSocialsApiUrl: env.UNIFIED_SOCIALS_API_URL ?? 'https://unified-socials.hackclub.com/api/v1',
	minReviewLength: Number(env.MIN_REVIEW_LENGTH ?? 40)
};

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

