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
		submissions: `submissions${s}`
	};
}

// Not in tablesFor, so only code that names this table reads addresses.
/** @param {'dev' | 'prod'} appEnv */
export function shippingTableFor(appEnv) {
	return appEnv === 'prod' ? 'shipping' : 'shipping_dev';
}

export const F = {
	participants: {
		slackId: 'slack_id',
		name: 'name',
		email: 'email',
		avatar: 'avatar',
		tz: 'tz',
		status: 'status',
		daysCompleted: 'days_completed',
		streakFreezes: 'streak_freezes',
		currentStreak: 'current_streak',
		verificationStatus: 'verification_status',
		yswsEligible: 'ysws_eligible',
		lastMilestone: 'last_milestone',
		lastMilestoneAt: 'last_milestone_at',
		remindersOff: 'reminders_off',
		lastReminderDay: 'last_reminder_day',
		lastDay: 'last_day',
		totalViews: 'total_views'
	},
	days: {
		slackId: 'slack_id',
		date: 'date',
		status: 'status',
		deletedAt: 'deleted_at'
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
		views: 'views',
		title: 'title',
		thumbnailUrl: 'thumbnail_url',
		archiveUrl: 'archive_url',
		unifiedId: 'unified_id',
		replyMessageTs: 'reply_message_ts',
		replyStats: 'reply_stats',
		streakAtPost: 'streak_at_post',
		freezesAtPost: 'freezes_at_post',
		deletedAt: 'deleted_at',
		preDeleteState: 'pre_delete_state',
		messageDeletedAt: 'message_deleted_at',
		primarySubmission: 'primary_submission',
		noHcMention: 'no_hc_mention',
		likes: 'likes',
		availability: 'availability',
		availabilityCheckedAt: 'availability_checked_at',
		durationSeconds: 'duration_seconds',
		publishedAt: 'published_at',
		repeatOf: 'repeat_of',
		repeatReason: 'repeat_reason',
		pendingCheck: 'pending_check',
		reviewRequestedAt: 'review_requested_at',
		reviewStatus: 'review_status',
		reviewedBy: 'reviewed_by',
		reviewedAt: 'reviewed_at',
		reviewFeedback: 'review_feedback'
	},
	shipping: {
		slackId: 'slack_id',
		firstName: 'first_name',
		lastName: 'last_name',
		email: 'email',
		slackUsername: 'slack_username',
		addressLine1: 'address_line_1',
		addressLine2: 'address_line_2',
		city: 'city',
		state: 'state',
		zip: 'zip',
		country: 'country',
		birthday: 'birthday',
		shippedPrizes: 'shipped_prizes',
		submittedAt: 'submitted_at'
	}
};

export const DAY_STATUSES = ['posted', 'frozen', 'missed'];
export const REVIEW_STATUSES = ['starred', 'passed', 'rejected'];
export const PARTICIPANT_STATUSES = ['notStarted', 'active', 'frozen', 'broken'];

// Excludes blank rows (e.g. added by hand in Airtable) from any full-table participant listing.
export const PARTICIPANT_HAS_SLACK_ID = `NOT({${F.participants.slackId}} = "")`;

// Deleted submissions stay in the table for review but are hidden everywhere else.
export const SUBMISSION_NOT_DELETED = `{${F.submissions.deletedAt}} = BLANK()`;

// Extra platform links for a video point at its first submission, which holds the streak and reply.
// Waiting on a publish date or length, so it neither counts nor shows anywhere yet.
export const SUBMISSION_CHECKED = `NOT({${F.submissions.pendingCheck}})`;

export const SUBMISSION_IS_PRIMARY = `{${F.submissions.primarySubmission}} = BLANK()`;
