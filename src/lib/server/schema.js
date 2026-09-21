// Table and field names only — no $env imports, so plain-node scripts can import this too.

/**
 * Both environments share one Airtable base — dev gets its own copy of each table under a `_dev`
 * suffix. Prod keeps the bare names, so the tables that already exist never have to be renamed,
 * and `_dev` matches the snake_case the field names already use.
 * @param {'dev' | 'prod'} appEnv
 */
export function tablesFor(appEnv) {
	const s = appEnv === 'prod' ? '' : '_dev';
	return {
		participants: `participants${s}`,
		days: `days${s}`,
		submissions: `submissions${s}`,
		reviews: `reviews${s}`
	};
}

export const F = {
	participants: {
		slackId: 'slack_id',
		name: 'name',
		email: 'email',
		tz: 'tz',
		status: 'status',
		daysCompleted: 'days_completed',
		streakFreezes: 'streak_freezes',
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
		reviewCount: 'review_count',
		views: 'views',
		title: 'title',
		unifiedId: 'unified_id',
		replyMessageTs: 'reply_message_ts',
		streakAtPost: 'streak_at_post',
		freezesAtPost: 'freezes_at_post'
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

export const DAY_STATUSES = ['posted', 'frozen', 'missed'];
export const PARTICIPANT_STATUSES = ['notStarted', 'active', 'frozen', 'broken'];

// Excludes blank rows (e.g. added by hand in Airtable) from any full-table participant listing.
export const PARTICIPANT_HAS_SLACK_ID = `NOT({${F.participants.slackId}} = "")`;
