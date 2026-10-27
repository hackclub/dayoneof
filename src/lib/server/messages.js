import { config } from './config.js';
import { HELP_CHANNEL_ID } from '../help.js';

const NOT_TRACKED = 'Stats: not tracked yet, check back later.';
const OTHER_PLATFORMS = 'Upload it to other platforms too! You can link them in a reply to this thread.';

/** @type {Record<string, string>} */
const PLATFORM_NAMES = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram' };

/** @typedef {{ views: number, likes: number, shares: number | null, watchHours: number | null, watchHoursEstimated: boolean }} PostStats */

/** @param {PostStats | null | undefined} stats */
export function statsLine(stats) {
	if (!stats) return NOT_TRACKED;
	const parts = [`${stats.views} views`, `${stats.likes} likes`];
	if (stats.shares != null) parts.push(`${stats.shares} shares`);
	if (stats.watchHours != null) {
		parts.push(`${stats.watchHoursEstimated ? '~' : ''}${stats.watchHours.toFixed(1)} watch hours`);
	}
	return `Stats: ${parts.join(' · ')}`;
}

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
		return `<@${slackId}> something went wrong on our end handling that post, so it might not have counted. Try posting it again in a minute, and if it still doesn't work, ask for help in <#${HELP_CHANNEL_ID}>!`;
	},
	// An old video is the rule working, not a failure, so this doesn't point at #dayoneof-help.
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
	// Points at #dayoneof-help since only a human can check a repost the poster believes is new.
	/**
	 * @param {string} slackId
	 * @param {string} platform
	 */
	awaitingData(slackId, platform) {
		const tip =
			platform === 'instagram'
				? '\nInstagram-only posts take about an hour to confirm. Reply here with its YouTube or TikTok link to count it right away!'
				: '';
		return `<@${slackId}> waiting on data to count your streak, check back in around an hour!${tip}`;
	},
	/** @param {string} slackId */
	otherPlatformAwaitingData(slackId) {
		return `<@${slackId}> waiting on data to add that link, check back in around an hour!`;
	},
	manualReview() {
		const reviewers = config.reviewerSlackIds.map((id) => `<@${id}>`).join(' ');
		return `${reviewers} this video needs manual review, bot couldn't verify!`;
	},
	/**
	 * @param {string} slackId
	 * @param {string} feedback
	 */
	starred(slackId, feedback) {
		const note = feedback ? `\n${feedback}` : '';
		return `<@${slackId}> ⭐ this video got starred by the reviewers, so you'll get extra stickers!${note}`;
	},
	/**
	 * @param {string} slackId
	 * @param {string} feedback
	 */
	reviewFeedback(slackId, feedback) {
		return `<@${slackId}> feedback from the reviewers: ${feedback}`;
	},
	/** @param {string} slackId */
	duplicateVideo(slackId) {
		return `<@${slackId}> that video has already been posted, so it can't count toward your streak. Post a different video, and if you think this is a mistake, send a message in <#${HELP_CHANNEL_ID}>!`;
	},
	/**
	 * @param {number} streak
	 * @param {number} freezesRemaining
	 * @param {PostStats | null} [stats]
	 */
	streakUpdate(streak, freezesRemaining, stats) {
		const day = streak === 1 ? 'day' : 'days';
		return `Day ${streak} logged! 🔥 ${streak}-${day} streak · ${freezesRemaining} freeze${freezesRemaining === 1 ? '' : 's'} in the bank.\n${statsLine(stats)}\n${OTHER_PLATFORMS}`;
	},
	/**
	 * @param {string} slackId
	 * @param {number} streak
	 * @param {number} freezesRemaining
	 * @param {PostStats | null} [stats]
	 */
	duplicatePost(slackId, streak, freezesRemaining, stats) {
		return `<@${slackId}> you've already posted today, so this one's saved but won't count toward your streak. Still at ${streak} days · ${freezesRemaining} freeze${freezesRemaining === 1 ? '' : 's'}.\n${statsLine(stats)}\n${OTHER_PLATFORMS}`;
	},
	/**
	 * @param {string} slackId
	 * @param {string} platform
	 */
	platformAlreadyLinked(slackId, platform) {
		return `<@${slackId}> this video already has a ${PLATFORM_NAMES[platform] ?? platform} link, so that one wasn't added. Link it from a different platform!`;
	},
	/** @param {string} slackId */
	otherPlatformDuplicate(slackId) {
		return `<@${slackId}> that video has already been posted, so it wasn't added as another platform. If you think this is a mistake, send a message in <#${HELP_CHANNEL_ID}>!`;
	},
	/** @param {string} slackId */
	otherPlatformTooOld(slackId) {
		return `<@${slackId}> that video was published well before this one, so it wasn't added. Only link this same video on other platforms!`;
	},
	/**
	 * @param {string} slackId
	 * @param {number} minSeconds
	 */
	otherPlatformTooShort(slackId, minSeconds) {
		return `<@${slackId}> that video is shorter than ${minSeconds} seconds, so it wasn't added.`;
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
		const form = `the fulfillment form (${config.prizeFormUrl || `${config.siteUrl}/form`})`;
		return `You hit ${milestone} days! Fill out ${form} to claim your reward.`;
	},
	/**
	 * @param {string} slackId
	 * @param {number} milestone
	 */
	milestoneThread(slackId, milestone) {
		const form = config.prizeFormUrl || `${config.siteUrl}/form`;
		return `<@${slackId}> you just unlocked the ${milestone}-day prize! 🎉 Fill out ${form} so we know where to ship it.`;
	},
	/**
	 * @param {string} slackId
	 * @param {string} url
	 * @param {number} milestone
	 */
	viewMilestoneAnnounce(slackId, url, milestone) {
		return `<@${slackId}>'s video just passed ${milestone.toLocaleString('en-US')} views! 🎉 ${url}`;
	},
	reminder() {
		return "Haven't seen today's video yet. Post it before 3am your time to keep your streak alive.";
	},
	/** @param {number} freezesRemaining */
	dayFrozen(freezesRemaining) {
		return `You missed yesterday, so a freeze saved your streak (frozen days don't add to it). ${freezesRemaining} freeze${freezesRemaining === 1 ? '' : 's'} left.`;
	},
	/**
	 * @param {string} day
	 * @param {string} reason
	 */
	rejectedDm(day, reason) {
		return `Your #dayoneof submission on ${day} has been rejected: ${reason}`;
	},
	/** @param {string} reason */
	rejectedReply(reason) {
		return `This submission was rejected and doesn't count toward your streak: ${reason}`;
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
