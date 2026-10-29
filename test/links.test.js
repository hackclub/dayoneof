import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLink, extractLinks, createdAtFromId } from '../src/lib/server/links.js';

test('unwraps a Slack-wrapped link with no label', async () => {
	const link = await extractLink('<https://www.youtube.com/watch?v=g4H16UR-kaE>');
	assert.deepEqual(link, {
		url: 'https://www.youtube.com/watch?v=g4H16UR-kaE',
		platform: 'youtube',
		videoId: 'g4H16UR-kaE'
	});
});

test('unwraps a Slack-wrapped link with a truncated ellipsis label', async () => {
	// what Slack actually sends for a long URL: <real-url|shortened…-display>
	const link = await extractLink('<https://www.youtube.com/watch?v=g4H16UR-kaE|youtube.com/watch?v=…>');
	assert.equal(link?.url, 'https://www.youtube.com/watch?v=g4H16UR-kaE');
	assert.equal(link?.videoId, 'g4H16UR-kaE');
});

test('normalizes youtu.be and shorts links to the canonical watch URL', async () => {
	assert.equal((await extractLink('<https://youtu.be/g4H16UR-kaE>'))?.url, 'https://www.youtube.com/watch?v=g4H16UR-kaE');
	assert.equal(
		(await extractLink('<https://www.youtube.com/shorts/g4H16UR-kaE>'))?.url,
		'https://www.youtube.com/watch?v=g4H16UR-kaE'
	);
});

test('strips query params and tracking junk from a plain pasted link', async () => {
	const link = await extractLink('https://www.youtube.com/watch?v=g4H16UR-kaE&feature=share&si=abc123');
	assert.equal(link?.url, 'https://www.youtube.com/watch?v=g4H16UR-kaE');
});

test('stops a YouTube id at 11 characters when text runs into it', async () => {
	const link = await extractLink('https://www.youtube.com/watch?v=LrrcijZmQw0day');
	assert.equal(link?.videoId, 'LrrcijZmQw0');
});

test('normalizes an Instagram reel link', async () => {
	const link = await extractLink('<https://www.instagram.com/reel/DdPz2m6S41Q/|instagram.com/reel/…>');
	assert.deepEqual(link, {
		url: 'https://www.instagram.com/reel/DdPz2m6S41Q/',
		platform: 'instagram',
		videoId: 'DdPz2m6S41Q'
	});
});

test('trims the suffix some Instagram share links add to the shortcode', async () => {
	const link = await extractLink(
		'<https://www.instagram.com/what.todoinaday/reel/DfCiWHBB95XzO2vAwEsT_-03JkOk9i2R77piG80/>'
	);
	assert.equal(link?.url, 'https://www.instagram.com/reel/DfCiWHBB95X/');
	assert.equal(link?.videoId, 'DfCiWHBB95X');
});

test('normalizes a TikTok link, keeping the username', async () => {
	const link = await extractLink(
		'<https://www.tiktok.com/@starthackclub/video/7685814420957580575?_r=1|tiktok.com/@starthackclub/video/…>'
	);
	assert.deepEqual(link, {
		url: 'https://www.tiktok.com/@starthackclub/video/7685814420957580575',
		platform: 'tiktok',
		videoId: '7685814420957580575'
	});
});

test('returns null for text with no recognized link', async () => {
	assert.equal(await extractLink('just chatting, no link here'), null);
	assert.equal(await extractLink(undefined), null);
});

test('extracts every distinct video in a message, in order', async () => {
	const links = await extractLinks(
		'<https://youtu.be/g4H16UR-kaE> and <https://www.instagram.com/reel/DdPz2m6S41Q/> again https://www.youtube.com/shorts/g4H16UR-kaE'
	);
	assert.deepEqual(
		links.map((l) => l.platform),
		['youtube', 'instagram']
	);
	assert.deepEqual(await extractLinks('no links'), []);
});

test('reads creation time out of TikTok and Instagram ids', () => {
	assert.equal(
		createdAtFromId({ platform: 'tiktok', videoId: '7701227063537061141' }),
		'2026-10-27T06:14:14.000Z'
	);
	assert.equal(
		createdAtFromId({ platform: 'instagram', videoId: 'DepZpLyAEfG' }),
		'2026-10-18T19:09:27.869Z'
	);
	assert.equal(createdAtFromId({ platform: 'youtube', videoId: 'G7xsd5MWVa4' }), null);
});
