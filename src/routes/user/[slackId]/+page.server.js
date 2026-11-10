import { error, fail } from '@sveltejs/kit';
import { TABLES, F, PARTICIPANT_HAS_SLACK_ID } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';
import { deleteSubmission, deletionPlan, sameDayBackup } from '$lib/server/deletion.js';
import { serialize } from '$lib/server/queue.js';
import { groupByVideo, videoPlatforms } from '$lib/server/videos.js';
import { addDays } from '$lib/server/streak.js';

/** @param {ReturnType<typeof groupByVideo>} groups */
function viewsByDay(groups) {
	/** @type {Map<string, number>} */
	const views = new Map();
	for (const { primary, views: n } of groups) {
		const day = primary.fields[F.submissions.day];
		if (day) views.set(day, (views.get(day) ?? 0) + n);
	}
	const days = [...views.keys()].sort();
	const points = [];
	for (let day = days[0]; day && day <= days[days.length - 1]; day = addDays(day, 1)) {
		points.push({ date: day, value: views.get(day) ?? 0 });
	}
	return points;
}

/** @param {import('$lib/server/airtable.js').AirtableRecord[]} rows */
function viewsByPlatform(rows) {
	/** @type {Map<string, number>} */
	const views = new Map();
	for (const s of rows) {
		const platform = s.fields[F.submissions.platform];
		views.set(platform, (views.get(platform) ?? 0) + (s.fields[F.submissions.views] ?? 0));
	}
	return [...views]
		.filter(([, n]) => n > 0)
		.map(([platform, n]) => ({ platform, views: n }))
		.sort((a, b) => b.views - a.views);
}

export async function load({ params, locals }) {
	const [participants, allSubmissions] = await Promise.all([
		airtable.listCached(TABLES.participants, { filterByFormula: PARTICIPANT_HAS_SLACK_ID }),
		airtable.listCached(TABLES.submissions, {
			sort: [{ field: F.submissions.postedAt, direction: 'desc' }]
		})
	]);

	const participant = participants.find(
		(p) => p.fields[F.participants.slackId] === params.slackId
	);
	if (!participant) error(404, "Nobody's signed up with that Slack ID.");

	const submissions = allSubmissions.filter(
		(s) =>
			s.fields[F.submissions.slackId] === params.slackId &&
			!s.fields[F.submissions.deletedAt] &&
			!s.fields[F.submissions.pendingCheck]
	);
	const isMe = locals.session?.slackId === params.slackId;
	const groups = groupByVideo(submissions);

	return {
		session: locals.session,
		name: participant.fields[F.participants.name],
		slackId: params.slackId,
		avatar: participant.fields[F.participants.avatar] || '',
		currentStreak: participant.fields[F.participants.currentStreak] ?? 0,
		streakFreezes: Number(participant.fields[F.participants.streakFreezes] ?? 0),
		totalViews: participant.fields[F.participants.totalViews] ?? 0,
		videosPosted: groups.length,
		viewsByDay: viewsByDay(groups),
		viewsByPlatform: viewsByPlatform(groups.flatMap(({ rows }) => rows)),
		videos: groups.map(({ primary: s, rows, views }) => {
			const counted = !!s.fields[F.submissions.countedTowardStreak];
			const plan =
				isMe && counted && !sameDayBackup(allSubmissions, s) ? deletionPlan(participant, s, allSubmissions) : null;
			return {
				key: s.id,
				id: isMe ? s.id : '',
				platforms: videoPlatforms(rows),
				postedAt: s.fields[F.submissions.postedAt],
				views,
				countedTowardStreak: counted,
				deleteImpact: !isMe || !counted ? 'none' : (plan?.impact ?? 'transfer'),
				deleteTakesFreeze: !!plan?.earnedFreeze
			};
		})
	};
}

export const actions = {
	deleteVideo: async ({ request, params, locals }) => {
		if (locals.session?.slackId !== params.slackId) error(403, 'You can only delete your own videos.');
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		if (!/^rec[A-Za-z0-9]{14}$/.test(id)) return fail(400, { deleteError: "That video couldn't be found." });
		if (String(data.get('confirm') ?? '').trim().toUpperCase() !== 'DELETE') {
			return fail(400, { deleteError: 'Type DELETE to confirm.' });
		}
		const impact = await serialize(() => deleteSubmission(id, params.slackId));
		if (!impact) return fail(404, { deleteError: "That video couldn't be found." });
		return { deleted: impact };
	}
};
