import { TABLES, F, PARTICIPANT_HAS_SLACK_ID, isAdmin } from '$lib/server/config.js';
import { isYswsEligible } from '$lib/server/verification.js';
import * as airtable from '$lib/server/airtable.js';
import { count } from '$lib/format';
import { compareStreaks } from '$lib/server/streak.js';
import { groupByVideo, videoPlatforms } from '$lib/server/videos.js';

const BOARD_SIZE = 10;

// Names and titles arrive from Slack profiles and video captions, so nothing about their length is
// guaranteed. Truncating here rather than only in CSS keeps a 300-character display name from
// riding along in the payload and out of its box on every surface that renders it.
const NAME_MAX = 40;
const TITLE_MAX = 90;

/**
 * @param {unknown} value
 * @param {number} max
 */
function cap(value, max) {
	const text = String(value ?? '').trim();
	return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export async function load({ locals }) {
	const [participants, allSubmissions] = await Promise.all([
		airtable.listCached(TABLES.participants, { filterByFormula: PARTICIPANT_HAS_SLACK_ID }),
		airtable.listCached(TABLES.submissions, {
			sort: [{ field: F.submissions.postedAt, direction: 'desc' }]
		})
	]);
	const submissions = allSubmissions.filter((s) => !s.fields[F.submissions.deletedAt]);

	const nameBySlackId = new Map(
		participants.map((p) => [
			p.fields[F.participants.slackId],
			cap(p.fields[F.participants.name], NAME_MAX) || 'Unknown'
		])
	);

	const videos = groupByVideo(submissions).map(({ primary, rows, views }) => {
		const platforms = videoPlatforms(rows).map((p) => ({ ...p, title: cap(p.title, TITLE_MAX) }));
		return {
			key: primary.id,
			slackId: primary.fields[F.submissions.slackId],
			name: nameBySlackId.get(primary.fields[F.submissions.slackId]) ?? 'Unknown',
			url: platforms[0].url,
			platform: platforms[0].platform,
			title: platforms[0].title,
			platforms,
			postedAt: primary.fields[F.submissions.postedAt],
			views: count(views)
		};
	});

	const byStreak = [...participants]
		.sort(compareStreaks)
		.slice(0, BOARD_SIZE)
		.map((p) => ({
			slackId: p.fields[F.participants.slackId],
			name: nameBySlackId.get(p.fields[F.participants.slackId]) ?? 'Unknown',
			streak: count(p.fields[F.participants.currentStreak]),
			freezes: count(p.fields[F.participants.streakFreezes])
		}));

	const byViews = [...participants]
		.sort(
			(a, b) =>
				count(b.fields[F.participants.totalViews]) - count(a.fields[F.participants.totalViews])
		)
		.slice(0, BOARD_SIZE)
		.map((p) => ({
			slackId: p.fields[F.participants.slackId],
			name: nameBySlackId.get(p.fields[F.participants.slackId]) ?? 'Unknown',
			views: count(p.fields[F.participants.totalViews])
		}));

	const byVideo = [...videos].sort((a, b) => b.views - a.views).slice(0, BOARD_SIZE);

	const session = locals.session;
	// A first sign-in lands before the stale participant list has refreshed to include them.
	const me = session
		? (participants.find((p) => p.fields[F.participants.slackId] === session.slackId) ??
			(await airtable.find(TABLES.participants, airtable.eq(F.participants.slackId, session.slackId))))
		: null;

	return {
		session,
		isAdmin: isAdmin(session?.slackId),
		name: me ? cap(me.fields[F.participants.name], NAME_MAX) || null : null,
		avatar: me?.fields[F.participants.avatar] || '',
		verified: isYswsEligible(me?.fields[F.participants.yswsEligible]),
		hasPosted: !!session && videos.some((v) => v.slackId === session.slackId),
		videosPosted: videos.length,
		videos,
		byStreak,
		byViews,
		byVideo
	};
}
