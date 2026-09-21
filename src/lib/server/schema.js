// Table and field names only — no $env imports, so plain-node scripts can import this too.

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
