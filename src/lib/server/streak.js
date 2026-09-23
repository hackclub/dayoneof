/** @typedef {{ date: string, status: 'frozen' | 'missed' }} MissedDay */

export const MILESTONES = [2, 7, 15, 25];
export const MAX_STREAK_FREEZES = 3;
const DEADLINE_HOUR = 1;

// A day runs until 1am in the participant's own timezone, so a post at 00:30 still counts for the
// day before.
/**
 * @param {string | undefined} tz
 * @param {Date} [now]
 */
export function streakDay(tz, now = new Date()) {
	const shifted = new Date(now.getTime() - DEADLINE_HOUR * 60 * 60 * 1000);
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: tz || 'UTC',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(shifted);
}

/**
 * @param {string} day
 * @param {number} n
 */
export function addDays(day, n) {
	const date = new Date(`${day}T00:00:00Z`);
	date.setUTCDate(date.getUTCDate() + n);
	return date.toISOString().slice(0, 10);
}

// Unknown means allowed: a video posted minutes ago usually isn't tracked yet, so there is no
// publish date to judge and refusing on a missing one would reject the ordinary case.
/**
 * @param {string | null | undefined} publishedAt
 * @param {number} maxAgeDays
 * @param {Date} [now]
 */
export function isPostTooOld(publishedAt, maxAgeDays, now = new Date()) {
	if (!publishedAt) return false;
	const published = Date.parse(publishedAt);
	if (Number.isNaN(published)) return false;
	return now.getTime() - published > maxAgeDays * 24 * 60 * 60 * 1000;
}

// Unknown means allowed, for the same reason as isPostTooOld.
/**
 * @param {number | null | undefined} durationSeconds
 * @param {number} minSeconds
 */
export function isVideoTooShort(durationSeconds, minSeconds) {
	return typeof durationSeconds === 'number' && durationSeconds < minSeconds;
}

// Every second posted day banks one freeze, up to the cap. Spent freezes stay spent.
/**
 * @param {number} freezes
 * @param {number} daysCompleted
 */
export function freezesAfterPost(freezes, daysCompleted) {
	return daysCompleted % 2 === 0 ? Math.min(MAX_STREAK_FREEZES, freezes + 1) : freezes;
}

// Each day after lastDay through throughDay went unposted: a freeze covers it and keeps the streak
// growing, and the first one without a freeze breaks the streak and ends the walk.
/**
 * @param {{ lastDay: string, freezes: number, streak: number }} state
 * @param {string} throughDay
 */
export function settleMissedDays({ lastDay, freezes, streak }, throughDay) {
	/** @type {MissedDay[]} */
	const days = [];
	for (let day = addDays(lastDay, 1); day <= throughDay; day = addDays(day, 1)) {
		if (freezes === 0) {
			days.push({ date: day, status: 'missed' });
			return { days, freezes, streak: 0, broke: true };
		}
		freezes--;
		streak++;
		days.push({ date: day, status: 'frozen' });
	}
	return { days, freezes, streak, broke: false };
}

/**
 * @param {number} streak
 * @param {number | null | undefined} lastMilestone
 */
export function nextMilestone(streak, lastMilestone) {
	return MILESTONES.find((m) => streak >= m && m > (lastMilestone ?? 0)) ?? null;
}
