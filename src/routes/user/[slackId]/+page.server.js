import { error, fail } from '@sveltejs/kit';
import { TABLES, F, PARTICIPANT_HAS_SLACK_ID } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';
import { deleteSubmission, deletionPlan } from '$lib/server/deletion.js';
import { serialize } from '$lib/server/queue.js';

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
		(s) => s.fields[F.submissions.slackId] === params.slackId && !s.fields[F.submissions.deletedAt]
	);
	const isMe = locals.session?.slackId === params.slackId;

	return {
		session: locals.session,
		name: participant.fields[F.participants.name],
		slackId: params.slackId,
		avatar: participant.fields[F.participants.avatar] || '',
		currentStreak: participant.fields[F.participants.currentStreak] ?? 0,
		totalViews: participant.fields[F.participants.totalViews] ?? 0,
		videosPosted: submissions.length,
		videos: submissions.map((s) => ({
			id: isMe ? s.id : '',
			url: s.fields[F.submissions.url],
			platform: s.fields[F.submissions.platform],
			title: s.fields[F.submissions.title] || '',
			thumbnail: s.fields[F.submissions.thumbnailUrl] || '',
			postedAt: s.fields[F.submissions.postedAt],
			views: s.fields[F.submissions.views] ?? 0,
			countedTowardStreak: !!s.fields[F.submissions.countedTowardStreak],
			deleteImpact:
				isMe && s.fields[F.submissions.countedTowardStreak]
					? deletionPlan(participant, s).impact
					: 'none'
		}))
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
