// Shared by /home and /user/[slackId], which render the same video tiles and the same person.
const viewFormatter = new Intl.NumberFormat('en-US', { notation: 'compact' });
const dateFormatter = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' });

/** A non-negative whole number, or 0 for anything Airtable left blank or malformed. */
export function count(value: unknown) {
	return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
}

export function formatViews(views: number) {
	return viewFormatter.format(views);
}

export function formatDate(value: string | undefined) {
	if (!value) return '';
	const date = new Date(value);
	return Number.isNaN(date.valueOf()) ? '' : dateFormatter.format(date);
}

/** Stands in for the avatar when Slack had no profile image to give us. */
export function initials(name: string | null | undefined) {
	return (name ?? '')
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? '')
		.join('');
}
