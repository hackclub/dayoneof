<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import { assetSheet } from '$lib/asset_sheet';
	import '@fontsource/figtree/latin-400.css';
	import '@fontsource/figtree/latin-600.css';
	import '@fontsource/figtree/latin-700.css';
	import '@fontsource/figtree/latin-800.css';
	import '@fontsource/shantell-sans/latin-400.css';
	import '@fontsource/shantell-sans/latin-600.css';
	import '@fontsource/shantell-sans/latin-700.css';
	import figtree400 from '@fontsource/figtree/files/figtree-latin-400-normal.woff2?url';
	import figtree600 from '@fontsource/figtree/files/figtree-latin-600-normal.woff2?url';
	import shantell600 from '@fontsource/shantell-sans/files/shantell-sans-latin-600-normal.woff2?url';

	let { children, data } = $props();

	// Collapses Slack ids out of /user paths and drops /admin, which isn't a public page.
	function reportedPath(path: string) {
		if (path.startsWith('/admin')) return null;
		return path.replace(/^\/user\/[^/?#]+/, '/user/:slackId');
	}

	// count.js is vendored so it loads same-origin; gc.zgo.at is on tracker blocklists.
	$effect(() => {
		if (!data.goatcounterUrl || window.goatcounter) return;
		window.goatcounter = { endpoint: `${data.goatcounterUrl}/count`, path: reportedPath };

		const script = document.createElement('script');
		script.async = true;
		script.src = '/count.js';
		document.head.append(script);
	});

	// count.js only counts the first load; a blank referrer keeps internal hops uncredited.
	afterNavigate(({ type }) => {
		if (type === 'enter') return;
		window.goatcounter?.count?.({ referrer: '' });
	});
</script>

<svelte:head>
	<link rel="icon" href="/favicon.png" type="image/png" />
	<link rel="preload" href={figtree400} as="font" type="font/woff2" crossorigin="anonymous" />
	<link rel="preload" href={figtree600} as="font" type="font/woff2" crossorigin="anonymous" />
	<link rel="preload" href={shantell600} as="font" type="font/woff2" crossorigin="anonymous" />
	<link rel="preload" href={assetSheet} as="image" type="image/webp" />
	<meta name="theme-color" content="#f0dfae" />
	<meta property="og:site_name" content="Day One Of" />
	<meta property="og:locale" content="en_US" />
</svelte:head>

{@render children()}

<style>
	:global(html, body) {
		margin: 0;
		padding: 0;
		background: #f0dfae;
	}

	:global(.day-one) {
		--bg: #f0dfae;
		--bg-2: #fffbef;
		--note: #fbe7a1;
		--ink: #2b2216;
		--ink-soft: #75603f;
		--line: rgba(43, 34, 22, 0.3);
		--accent: #c4301f;
		--accent-ink: #fff7e8;
		--tape: #eec13e;
		--wash-1: 196, 108, 54;
		--wash-2: 139, 158, 110;
		--shadow: rgba(43, 34, 22, 0.24);
		--font-hand: 'Shantell Sans', 'Comic Sans MS', cursive;
		--cursor: url('/cursor.png') 2 0, auto;
		--cursor-pointer: url('/cursor_pointer.png') 11 10, pointer;
		--cursor-text: url('/cursor_text.png') 19 20, text;

		min-height: 100dvh;
		box-sizing: border-box;
		overflow-x: hidden;
		color-scheme: light;
		color: var(--ink);
		font-family: 'Figtree', system-ui, sans-serif;
		background-color: var(--bg);
		background-image:
			url('/doodles.webp'),
			radial-gradient(rgba(43, 34, 22, 0.055) 1px, transparent 1.3px),
			radial-gradient(rgba(43, 34, 22, 0.038) 1px, transparent 1.3px),
			radial-gradient(circle, rgba(var(--wash-1), 0.16), transparent 68%),
			radial-gradient(circle, rgba(var(--wash-2), 0.14), transparent 66%);
		background-size:
			320px 320px,
			15px 15px,
			9px 9px,
			62vw 62vw,
			55vw 55vw;
		background-position:
			0 0,
			0 0,
			4px 6px,
			-18vw -12vh,
			112vw 90vh;
		background-repeat: repeat, repeat, repeat, no-repeat, no-repeat;
		background-attachment: scroll, scroll, scroll, fixed, fixed;
	}

	:global(.day-one *) {
		box-sizing: border-box;
	}

	:global(.day-one .taped) {
		position: relative;
		isolation: isolate;
	}

	:global(.day-one .taped::before) {
		content: '';
		position: absolute;
		inset: calc(-1px - var(--grow) / 2) calc(-3px - var(--grow));
		background: var(--tape-bg);
		transform: rotate(var(--tilt));
		z-index: -1;
	}

	:global(::-webkit-scrollbar) {
		width: 12px;
		height: 12px;
	}

	:global(::-webkit-scrollbar-track) {
		background: transparent;
	}

	:global(::-webkit-scrollbar-thumb) {
		background: #eec13e;
		border: 2px solid #2b2216;
		border-radius: 999px;
	}

	:global(::-webkit-scrollbar-thumb:hover) {
		background: #c4301f;
	}

	:global(::-webkit-scrollbar-corner) {
		background: transparent;
	}

	@supports not selector(::-webkit-scrollbar) {
		:global(html),
		:global(.day-one *) {
			scrollbar-width: thin;
			scrollbar-color: #eec13e transparent;
		}
	}

	:global(.day-one) {
		cursor: var(--cursor);
	}

	:global(.day-one :is(a, button, summary, label, select, input[type='range'])) {
		cursor: var(--cursor-pointer);
	}

	:global(.day-one :is(input:not([type='range']), textarea)) {
		cursor: var(--cursor-text);
	}

	:global(.day-one :is(button, input):disabled) {
		cursor: not-allowed;
	}
</style>
