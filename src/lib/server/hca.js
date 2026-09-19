import { config, requireEnv } from './config.js';

const ISSUER = 'https://auth.hackclub.com';
const AUTHORIZE_URL = `${ISSUER}/oauth/authorize`;
const TOKEN_URL = `${ISSUER}/oauth/token`;
const USERINFO_URL = `${ISSUER}/oauth/userinfo`;

/**
 * @param {string} state
 * @param {string} redirectUri
 */
export function authorizeUrl(state, redirectUri) {
	const params = new URLSearchParams({
		client_id: requireEnv('HCA_CLIENT_ID', config.hcaClientId),
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: 'openid email profile',
		state
	});
	return `${AUTHORIZE_URL}?${params}`;
}

/**
 * @param {string} code
 * @param {string} redirectUri
 */
export async function exchangeCode(code, redirectUri) {
	const res = await fetch(TOKEN_URL, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			redirect_uri: redirectUri,
			client_id: requireEnv('HCA_CLIENT_ID', config.hcaClientId),
			client_secret: requireEnv('HCA_CLIENT_SECRET', config.hcaClientSecret)
		})
	});
	if (!res.ok) throw new Error(`hca token exchange failed: ${res.status}`);
	return res.json();
}

/** @param {string} accessToken */
export async function getUserInfo(accessToken) {
	const res = await fetch(USERINFO_URL, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	if (!res.ok) throw new Error(`hca userinfo failed: ${res.status}`);
	return res.json();
}
