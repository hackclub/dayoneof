import { config } from './config.js';

/**
 * @param {string} method
 * @param {Record<string, unknown>} params
 */
async function call(method, params) {
	const res = await fetch(`https://slack.com/api/${method}`, {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${config.slackBotToken}`,
			'Content-Type': 'application/json; charset=utf-8'
		},
		body: JSON.stringify(params)
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

/**
 * @param {string} channel
 * @param {string[]} users
 */
export function inviteToChannel(channel, users) {
	return call('conversations.invite', { channel, users: users.join(',') });
}

/** @param {string} email */
export async function usersLookupByEmail(email) {
	const { user } = await call('users.lookupByEmail', { email });
	return user;
}
