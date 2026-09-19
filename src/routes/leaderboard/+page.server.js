import { TABLES, F } from '$lib/server/config.js';
import * as airtable from '$lib/server/airtable.js';

export async function load() {
	const participants = await airtable.list(TABLES.participants);

	const byStreak = [...participants]
		.sort((a, b) => (b.fields[F.participants.currentStreak] ?? 0) - (a.fields[F.participants.currentStreak] ?? 0))
		.map((p) => ({
			name: p.fields[F.participants.name],
			streak: p.fields[F.participants.currentStreak] ?? 0,
			freezes: p.fields[F.participants.streakFreezes] ?? 0
		}));

	const byViews = [...participants]
		.sort((a, b) => (b.fields[F.participants.totalViews] ?? 0) - (a.fields[F.participants.totalViews] ?? 0))
		.map((p) => ({
			name: p.fields[F.participants.name],
			views: p.fields[F.participants.totalViews] ?? 0
		}));

	return { byStreak, byViews };
}
