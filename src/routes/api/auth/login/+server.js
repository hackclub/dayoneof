import { redirect } from '@sveltejs/kit';
import { randomBytes } from 'node:crypto';
import { config } from '$lib/server/config.js';
import { authorizeUrl } from '$lib/server/hca.js';

export function GET({ cookies, url }) {
	const state = randomBytes(16).toString('hex');
	cookies.set('hca_state', state, { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600 });
	const redirectUri = `${config.siteUrl}/api/auth/callback`;
	const loginHint = url.searchParams.get('email')?.trim().toLowerCase() || undefined;
	const forceLogin = url.searchParams.has('reauth');
	if (forceLogin) {
		cookies.set('hca_reauth', '1', { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600 });
	} else {
		cookies.delete('hca_reauth', { path: '/' });
	}
	if (loginHint) {
		cookies.set('hca_email', loginHint, { path: '/', httpOnly: true, secure: true, sameSite: 'lax', maxAge: 600 });
	} else {
		cookies.delete('hca_email', { path: '/' });
	}
	redirect(302, authorizeUrl({ redirectUri, state, loginHint, forceLogin }));
}
