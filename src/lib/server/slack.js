import { config } from './config.js';

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
 * @param {string} channel
 * @param {string} text
 * @param {string} [thread_ts]
 */
export function postMessage(channel, text, thread_ts) {
	return call('chat.postMessage', { channel, text, thread_ts });
}

/**
 * @param {string} channel
 * @param {string} ts
 * @param {string} text
 */
export function updateMessage(channel, ts, text) {
	return call('chat.update', { channel, ts, text });
}

/**
 * @param {string} channel
 * @param {string} user
 * @param {string} text
 */
export function postEphemeral(channel, user, text) {
	return call('chat.postEphemeral', { channel, user, text });
}

/**
 * @param {string} user
 * @param {string} text
 */
export async function dm(user, text) {
	const { channel } = await call('conversations.open', { users: user });
	return postMessage(channel.id, text);
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
