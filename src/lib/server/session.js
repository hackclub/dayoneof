import { createHmac, timingSafeEqual } from 'node:crypto';
import { config, requireEnv } from './config.js';

const COOKIE_NAME = 'session';
const MAX_AGE = 60 * 60 * 24 * 30;

/** @param {string} payload */
function sign(payload) {
	const secret = requireEnv('SESSION_SECRET', config.sessionSecret);
	return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** @param {string} slackId */
export function createSessionValue(slackId) {
	const payload = JSON.stringify({ slackId, exp: Date.now() + MAX_AGE * 1000 });
	const encoded = Buffer.from(payload).toString('base64url');
	return `${encoded}.${sign(encoded)}`;
}

/** @param {string | undefined} value */
export function verifySessionValue(value) {
	if (!value) return null;
	const [encoded, signature] = value.split('.');
	if (!encoded || !signature) return null;
	const expected = sign(encoded);
	const a = Buffer.from(signature);
	const b = Buffer.from(expected);
	if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
	const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString());
	if (payload.exp < Date.now()) return null;
	return payload;
}

/**
 * @param {import('@sveltejs/kit').Cookies} cookies
 * @param {string} slackId
 */
export function setSessionCookie(cookies, slackId) {
	cookies.set(COOKIE_NAME, createSessionValue(slackId), {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge: MAX_AGE
	});
}

/** @param {import('@sveltejs/kit').Cookies} cookies */
export function clearSessionCookie(cookies) {
	cookies.delete(COOKIE_NAME, { path: '/' });
}

/** @param {import('@sveltejs/kit').Cookies} cookies */
export function getSession(cookies) {
	const value = cookies.get(COOKIE_NAME);
	const payload = verifySessionValue(value);
	return payload ? { slackId: payload.slackId } : null;
}
