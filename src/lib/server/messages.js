import { config } from './config.js';

const NOT_TRACKED = 'Stats: not tracked yet, check back later.';

export const messages = {
	/** @param {string} slackId */
	unsupportedLink(slackId) {
		return `<@${slackId}> that doesn't look like a YouTube, TikTok, or Instagram link. Post a link to today's video to keep your streak going.`;
	},
	/** @param {string} slackId */
	notLaunched(slackId) {
		return `<@${slackId}> the challenge hasn't started yet. Submissions open once 200 people have joined this channel, so invite your friends!`;
	},
	/** @param {string} slackId */
	notSignedIn(slackId) {
		return `<@${slackId}> you need to sign in with Hack Club Auth before your posts count. Sign in at ${config.siteUrl}/api/auth/login, then post your link again.`;
	},
	/**
	 * @param {string} slackId
	 * @param {string | undefined} status
	 */
	notVerified(slackId, status) {
		return `<@${slackId}> your Hack Club Auth account isn't verified as eligible yet (status: ${status ?? 'unknown'}). Only verified teens aged 13–18 can take part, so posts won't count until it is. Check ${config.siteUrl}/api/auth/login once you're verified.`;
	},
	// The post may or may not have been recorded when this fires, so it deliberately doesn't
	// promise either way — reconcile is what actually settles the day.
	/** @param {string} slackId */
	submissionFailed(slackId) {
		return `<@${slackId}> something went wrong on our end handling that post, so it might not have counted. Try posting it again in a minute, and if it still doesn't work, ask for help in #dayoneof on Slack!`;
	},
	// An old video is the rule working, not a failure, so this doesn't point at #dayoneof.
	/**
	 * @param {string} slackId
	 * @param {number} maxAgeDays
	 */
	postTooOld(slackId, maxAgeDays) {
		const ago = maxAgeDays === 1 ? 'a day' : `${maxAgeDays} days`;
		const span = maxAgeDays === 1 ? 'day' : `${maxAgeDays} days`;
		return `<@${slackId}> that video was published more than ${ago} ago, so it can't count toward your streak. Post something you've made in the last ${span}!`;
	},
	/**
	 * @param {string} slackId
	 * @param {number} minSeconds
	 */
	videoTooShort(slackId, minSeconds) {
		return `<@${slackId}> that video is shorter than ${minSeconds} seconds, so it can't count toward your streak. Post a video that's at least ${minSeconds} seconds long!`;
	},
	// Points at #dayoneof because, unlike an old video, a link the poster believes is new can only
	// be sorted out by a human looking at the earlier submission.
	/** @param {string} slackId */
	duplicateVideo(slackId) {
		return `<@${slackId}> that video has already been posted, so it can't count toward your streak. Post a different video, and if you think this is a mistake, send a message in #dayoneof on Slack!`;
	},
	/**
	 * @param {number} streak
	 * @param {number} freezesRemaining
	 * @param {{ views: number, likes: number } | null} [stats]
	 */
	streakUpdate(streak, freezesRemaining, stats) {
		const day = streak === 1 ? 'day' : 'days';
		const base = `Day ${streak} logged! 🔥 ${streak}-${day} streak · ${freezesRemaining} freeze${freezesRemaining === 1 ? '' : 's'} in the bank.`;
		if (!stats) return `${base}\n${NOT_TRACKED}`;
		return `${base}\nStats: ${stats.views} views · ${stats.likes} likes`;
	},
	/**
	 * @param {string} slackId
	 * @param {number} streak
	 * @param {number} freezesRemaining
	 * @param {{ views: number, likes: number } | null} [stats]
	 */
	duplicatePost(slackId, streak, freezesRemaining, stats) {
		const statsLine = stats ? `Stats: ${stats.views} views · ${stats.likes} likes` : NOT_TRACKED;
		return `<@${slackId}> you've already posted today, so this one's saved but won't count toward your streak. Still at ${streak} days · ${freezesRemaining} freeze${freezesRemaining === 1 ? '' : 's'}.\n${statsLine}`;
	},
	/**
	 * @param {string} slackId
	 * @param {number} milestone
	 */
	milestoneAnnounce(slackId, milestone) {
		return `<@${slackId}> just hit a ${milestone}-day streak! 🎉`;
	},
	/** @param {number} milestone */
	milestoneDm(milestone) {
		return `You hit ${milestone} days! Fill out the fulfillment form to claim your reward.`;
	},
	reminder() {
		return "Haven't seen today's video yet. Post it before 3am your time to keep your streak alive.";
	},
	/** @param {number} freezesRemaining */
	dayFrozen(freezesRemaining) {
		return `You missed yesterday, so a freeze saved your streak (frozen days don't add to it). ${freezesRemaining} freeze${freezesRemaining === 1 ? '' : 's'} left.`;
	},
	streakBroken() {
		return 'You missed yesterday and had no freezes left, so your streak reset. Post today to start a new one.';
	},
	/** @param {boolean} remindersOn */
	reminderToggled(remindersOn) {
		return remindersOn
			? "Reminders are back on. I'll nudge you at 8pm your time if you haven't posted."
			: "Reminders are off. I won't nudge you anymore.";
	},
	/**
	 * @param {string} text
	 * @param {boolean} remindersOn
	 */
	reminderBlocks(text, remindersOn) {
		return [
			{ type: 'section', text: { type: 'mrkdwn', text } },
			{
				type: 'actions',
				elements: [
					{
						type: 'button',
						action_id: 'toggle_reminders',
						text: { type: 'plain_text', text: remindersOn ? 'Turn off reminders' : 'Turn reminders back on' },
						value: remindersOn ? 'off' : 'on'
					}
				]
			}
		];
	}
};
