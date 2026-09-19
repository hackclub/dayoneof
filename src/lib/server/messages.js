export const messages = {
	unsupportedLink() {
		return "That doesn't look like a YouTube, TikTok, or Instagram link. Post a link to today's video to keep your streak going.";
	},
	/**
	 * @param {number} streak
	 * @param {number} freezesRemaining
	 */
	streakUpdate(streak, freezesRemaining) {
		const day = streak === 1 ? 'day' : 'days';
		return `Day ${streak} logged! 🔥 ${streak}-${day} streak · ${freezesRemaining} freeze${freezesRemaining === 1 ? '' : 's'} in the bank.`;
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
		return "Haven't seen today's video yet. Post it before midnight UTC to keep your streak alive.";
	},
	/** @param {number} freezesRemaining */
	dayFrozen(freezesRemaining) {
		return `You missed yesterday, so a freeze covered it. ${freezesRemaining} freeze${freezesRemaining === 1 ? '' : 's'} left.`;
	},
	streakBroken() {
		return "You missed yesterday and had no freezes left — your streak reset. Post today to start a new one.";
	},
	/**
	 * @param {number} streak
	 * @param {number} freezesRemaining
	 * @param {number} daysCompleted
	 */
	status(streak, freezesRemaining, daysCompleted) {
		return `Current streak: ${streak} days · ${freezesRemaining} freezes remaining · ${daysCompleted} days completed total.`;
	},
	/** @param {number} hour */
	remindSet(hour) {
		return `Got it — I'll remind you at ${hour}:00 your time if you haven't posted yet.`;
	},
	remindUsage() {
		return 'Usage: `@dayoneof remind <hour>` where hour is 0-23 in your local time.';
	}
};
