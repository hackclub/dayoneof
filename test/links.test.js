import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractLink } from '../src/lib/server/links.js';

test('unwraps a Slack-wrapped link with no label', () => {
	const link = extractLink('<https://www.youtube.com/watch?v=g4H16UR-kaE>');
	assert.deepEqual(link, {
		url: 'https://www.youtube.com/watch?v=g4H16UR-kaE',
		platform: 'youtube',
		videoId: 'g4H16UR-kaE'
	});
});

test('unwraps a Slack-wrapped link with a truncated ellipsis label', () => {
	// what Slack actually sends for a long URL: <real-url|shortened…-display>
	const link = extractLink('<https://www.youtube.com/watch?v=g4H16UR-kaE|youtube.com/watch?v=…>');
	assert.equal(link?.url, 'https://www.youtube.com/watch?v=g4H16UR-kaE');
	assert.equal(link?.videoId, 'g4H16UR-kaE');
});

test('normalizes youtu.be and shorts links to the canonical watch URL', () => {
	assert.equal(extractLink('<https://youtu.be/g4H16UR-kaE>')?.url, 'https://www.youtube.com/watch?v=g4H16UR-kaE');
	assert.equal(
		extractLink('<https://www.youtube.com/shorts/g4H16UR-kaE>')?.url,
		'https://www.youtube.com/watch?v=g4H16UR-kaE'
	);
});

test('strips query params and tracking junk from a plain pasted link', () => {
	const link = extractLink('https://www.youtube.com/watch?v=g4H16UR-kaE&feature=share&si=abc123');
	assert.equal(link?.url, 'https://www.youtube.com/watch?v=g4H16UR-kaE');
});

test('normalizes an Instagram reel link', () => {
	const link = extractLink('<https://www.instagram.com/reel/DdPz2m6S41Q/|instagram.com/reel/…>');
	assert.deepEqual(link, {
		url: 'https://www.instagram.com/reel/DdPz2m6S41Q/',
		platform: 'instagram',
		videoId: 'DdPz2m6S41Q'
	});
});

test('normalizes a TikTok link, keeping the username', () => {
	const link = extractLink(
		'<https://www.tiktok.com/@starthackclub/video/7685814420957580575?_r=1|tiktok.com/@starthackclub/video/…>'
	);
	assert.deepEqual(link, {
		url: 'https://www.tiktok.com/@starthackclub/video/7685814420957580575',
		platform: 'tiktok',
		videoId: '7685814420957580575'
	});
});

test('returns null for text with no recognized link', () => {
	assert.equal(extractLink('just chatting, no link here'), null);
	assert.equal(extractLink(undefined), null);
});
