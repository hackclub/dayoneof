import { redirect } from '@sveltejs/kit';
import { clearSessionCookie } from '$lib/server/session.js';

export function GET({ cookies }) {
	clearSessionCookie(cookies);
	redirect(302, '/');
}
