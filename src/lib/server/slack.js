import { createHmac, timingSafeEqual } from 'node:crypto';
import { config, requireEnv } from './config.js';

// Form-encoded, not JSON: Slack only accepts a JSON body on some write methods, and answers the
// rest as if the body were empty — users.info with a JSON body returns user_not_found for a user
// that plainly exists. Form encoding is accepted by every Web API method.
/**
 * @param {string} method
 * @param {Record<string, unknown>} params
 */
async function call(method, params) {
	const body = new URLSearchParams();
	for (const [key, value] of Object.entries(params)) {
		// A skipped optional (an unthreaded message's thread_ts) would otherwise be sent as the
		// literal string "undefined".
		if (value === undefined || value === null) continue;
		body.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
	}

	const res = await fetch(`https://slack.com/api/${method}`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${config.slackBotToken}`,
			'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8'
		},
		body
	});
	const data = await res.json();
	if (!data.ok) throw new Error(`slack ${method} failed: ${data.error}`);
	return data;
}

/**
 * @param {string} rawBody
 * @param {string | null} timestamp
 * @param {string | null} signature
 */
export function verifySignature(rawBody, timestamp, signature) {
	if (!timestamp || !signature) return false;
	if (Math.abs(Date.now() / 1000 - Number(timestamp)) > 60 * 5) return false;
	const base = `v0:${timestamp}:${rawBody}`;
	const secret = requireEnv('SLACK_SIGNING_SECRET', config.slackSigningSecret);
	const expected = `v0=${createHmac('sha256', secret).update(base).digest('hex')}`;
	const a = Buffer.from(signature);
	const b = Buffer.from(expected);
	return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * @param {string} channel
 * @param {string} text
 * @param {string} [thread_ts]
 * @param {unknown[]} [blocks]
 */
export function postMessage(channel, text, thread_ts, blocks) {
	return call('chat.postMessage', { channel, text, thread_ts, blocks });
}

/**
 * @param {string} channel
 * @param {string} ts
 * @param {string} text
 * @param {unknown[]} [blocks]
 */
export function updateMessage(channel, ts, text, blocks) {
	return call('chat.update', { channel, ts, text, blocks });
}

/**
 * @param {string} user
 * @param {string} text
 * @param {unknown[]} [blocks]
 */
export async function dm(user, text, blocks) {
	const { channel } = await call('conversations.open', { users: user });
	return postMessage(channel.id, text, undefined, blocks);
}

/**
 * @param {string} channel
 * @param {string} timestamp
 * @param {string} name
 */
export function addReaction(channel, timestamp, name) {
	return call('reactions.add', { channel, timestamp, name });
}

/** @param {string} userId */
export async function usersInfo(userId) {
	const { user } = await call('users.info', { user: userId });
	return user;
}

/** Identifies the bot itself — used to tell "the bot joined a channel" apart from a human. */
export async function authTest() {
	return call('auth.test', {});
}

/**
 * @param {string} channel
 * @param {string[]} users
 */
export function inviteToChannel(channel, users) {
	return call('conversations.invite', { channel, users: users.join(',') });
}
