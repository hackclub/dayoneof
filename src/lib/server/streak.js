/** @typedef {{ date: string, status: 'posted' | 'frozen' | 'missed' }} Day */

export const MILESTONES = [2, 7, 15, 25];
export const MAX_STREAK_FREEZES = 3;

export function utcDateString(date = new Date()) {
	return date.toISOString().slice(0, 10);
}

/**
 * @param {Day[]} days
 * @param {string} date
 */
export function isDuplicatePost(days, date) {
	return days.some((d) => d.date === date && d.status === 'posted');
}

/** @param {Day[]} days */
export function computeStreak(days) {
	const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
	let streak = 0;
	for (let i = sorted.length - 1; i >= 0; i--) {
		if (sorted[i].status === 'missed') break;
		streak++;
	}
	return streak;
}

/** @param {Day[]} days */
export function daysCompletedCount(days) {
	return days.filter((d) => d.status === 'posted').length;
}

/** @param {number} completedCount */
export function freezesEarned(completedCount) {
	return Math.min(MAX_STREAK_FREEZES, Math.floor(completedCount / 2));
}

/** @param {number} freezesAvailable */
export function resolveMissedDay(freezesAvailable) {
	if (freezesAvailable > 0) {
		return { status: 'frozen', freezesRemaining: freezesAvailable - 1, broke: false };
	}
	return { status: 'missed', freezesRemaining: 0, broke: true };
}

/**
 * @param {number} streak
 * @param {number | null | undefined} lastMilestone
 */
export function nextMilestone(streak, lastMilestone) {
	return MILESTONES.find((m) => streak >= m && m > (lastMilestone ?? 0)) ?? null;
}
