import { F } from './schema.js';
import { PRIZES } from '../prizes.js';

/** @typedef {{ date: string, status: 'frozen' | 'missed' }} MissedDay */

export const MILESTONES = PRIZES.map((p) => p.milestone);
export const PRIZE_NAMES = PRIZES.map((p) => p.name);
const VIEW_MILESTONES = [10_000, 100_000, 500_000, 1_000_000];
const MAX_STREAK_FREEZES = 3;
const DEADLINE_HOUR = 3;

// A day runs until 3am in the participant's own timezone, so a post at 02:30 still counts for the
// day before.
/**
 * @param {string | undefined} tz
 * @param {Date} [now]
 */
export function streakDay(tz, now = new Date()) {
	const shifted = new Date(now.getTime() - DEADLINE_HOUR * 60 * 60 * 1000);
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: tz || 'America/New_York',
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
// alive without growing it, and the first one without a freeze breaks the streak and ends the walk.
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

// last_milestone only ever rises, so a broken streak keeps the prizes it already unlocked.
/** @param {number | null | undefined} lastMilestone */
export function prizesUnlocked(lastMilestone) {
	return PRIZES.filter((p) => p.milestone <= (lastMilestone ?? 0)).map((p) => p.name);
}

/** @param {number} milestone */
export function prizeFor(milestone) {
	return PRIZES.find((p) => p.milestone === milestone)?.name;
}

// Only the highest threshold crossed, so a video that jumps past several gets one announcement.
/**
 * @param {number | null | undefined} before
 * @param {number} after
 */
export function viewMilestoneCrossed(before, after) {
	return VIEW_MILESTONES.findLast((m) => after >= m && m > (before ?? 0)) ?? null;
}

// Fewer freezes banked wins a tie: the same streak kept with less cover is the better run.
/**
 * @param {{ fields: Record<string, any> }} a
 * @param {{ fields: Record<string, any> }} b
 */
export function compareStreaks(a, b) {
	return (
		(b.fields[F.participants.currentStreak] ?? 0) - (a.fields[F.participants.currentStreak] ?? 0) ||
		(a.fields[F.participants.streakFreezes] ?? 0) - (b.fields[F.participants.streakFreezes] ?? 0)
	);
}

// Deleting today's counted post rolls it back so another can still be posted before the deadline.
// An earlier one leaves that day unposted: a freeze covers it, or the streak breaks.
// At the freeze cap it's unknown whether the post earned one, so the participant keeps it.
/**
 * @param {{ streak: number, freezes: number, daysCompleted: number }} state
 * @param {string} postDay
 * @param {string} today
 */
export function afterDeletingPost({ streak, freezes, daysCompleted }, postDay, today) {
	const completed = Math.max(0, daysCompleted - 1);
	if (postDay >= today) {
		const kept = Math.max(0, streak - 1);
		const earned = daysCompleted % 2 === 0 && freezes > 0 && freezes < MAX_STREAK_FREEZES;
		return {
			impact: /** @type {const} */ ('today'),
			dayStatus: null,
			fields: {
				[F.participants.currentStreak]: kept,
				[F.participants.streakFreezes]: earned ? freezes - 1 : freezes,
				[F.participants.daysCompleted]: completed,
				[F.participants.status]: kept > 0 ? 'active' : completed > 0 ? 'broken' : 'notStarted',
				[F.participants.lastDay]: addDays(today, -1)
			}
		};
	}
	if (freezes > 0) {
		const kept = Math.max(0, streak - 1);
		return {
			impact: /** @type {const} */ ('freeze'),
			dayStatus: /** @type {const} */ ('frozen'),
			fields: {
				[F.participants.currentStreak]: kept,
				[F.participants.streakFreezes]: freezes - 1,
				[F.participants.daysCompleted]: completed,
				...(kept > 0 ? {} : { [F.participants.status]: 'broken' })
			}
		};
	}
	return {
		impact: /** @type {const} */ ('break'),
		dayStatus: /** @type {const} */ ('missed'),
		fields: {
			[F.participants.currentStreak]: 0,
			[F.participants.daysCompleted]: completed,
			[F.participants.status]: 'broken'
		}
	};
}
