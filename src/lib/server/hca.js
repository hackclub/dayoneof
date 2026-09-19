// Hack Club Auth (auth.hackclub.com) - OIDC. Shape copied from hackclub/jamegam's
// src/lib/server/hca.js (2026-09-19) per IMPLEMENTATION.md's "copy jamegam verbatim" — jamegam
// is the one confirmed-working reference for this integration.
import { config, requireEnv } from './config.js';

/** @param {{ redirectUri: string, state: string }} params */
export function authorizeUrl({ redirectUri, state }) {
	const params = new URLSearchParams({
		client_id: requireEnv('HCA_CLIENT_ID', config.hcaClientId),
		redirect_uri: redirectUri,
		response_type: 'code',
		scope: config.hcaScope,
		state
	});
	return `${config.hcaIssuer}/oauth/authorize?${params}`;
}

/** @param {{ code: string, redirectUri: string }} params */
export async function exchangeCode({ code, redirectUri }) {
	// prints below are tagged [EXTCALL] — grep for that tag to strip them before shipping
	console.log('[EXTCALL] hca POST /oauth/token');
	const res = await fetch(`${config.hcaIssuer}/oauth/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({
			client_id: requireEnv('HCA_CLIENT_ID', config.hcaClientId),
			client_secret: requireEnv('HCA_CLIENT_SECRET', config.hcaClientSecret),
			redirect_uri: redirectUri,
			code,
			grant_type: 'authorization_code'
		})
	});
	if (!res.ok) throw new Error(`hca token exchange failed: ${res.status} ${await res.text()}`);
	return res.json(); // { access_token, id_token, ... }
}

// Every field the app's scopes grant: primary_email, first_name, last_name, slack_id,
// verification_status. An HCA account is a Hack Club Slack account, so slack_id is reliably
// present — no need to look the user up in Slack by email separately.
/** @param {string} accessToken */
export async function fetchMe(accessToken) {
	console.log('[EXTCALL] hca GET /api/v1/me');
	const res = await fetch(`${config.hcaIssuer}/api/v1/me`, {
		headers: { Authorization: `Bearer ${accessToken}` }
	});
	if (!res.ok) throw new Error(`hca /api/v1/me failed: ${res.status} ${await res.text()}`);
	const data = await res.json();
	return data.identity ?? data;
}
