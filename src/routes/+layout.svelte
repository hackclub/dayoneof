<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import '@fontsource/figtree/latin-400.css';
	import '@fontsource/figtree/latin-500.css';
	import '@fontsource/figtree/latin-600.css';
	import '@fontsource/figtree/latin-700.css';
	import '@fontsource/figtree/latin-800.css';
	import '@fontsource/shantell-sans/latin-400.css';
	import '@fontsource/shantell-sans/latin-500.css';
	import '@fontsource/shantell-sans/latin-600.css';
	import '@fontsource/shantell-sans/latin-700.css';
	import figtree400 from '@fontsource/figtree/files/figtree-latin-400-normal.woff2?url';
	import figtree600 from '@fontsource/figtree/files/figtree-latin-600-normal.woff2?url';
	import shantell600 from '@fontsource/shantell-sans/files/shantell-sans-latin-600-normal.woff2?url';

	let { children, data } = $props();

	// /user/[slackId] puts a Slack id in the path and /admin isn't a public page, so neither is
	// reported as it stands: returning null from the callback drops the pageview altogether.
	function reportedPath(path: string) {
		if (path.startsWith('/admin')) return null;
		return path.replace(/^\/user\/[^/?#]+/, '/user/:slackId');
	}

	// An effect rather than a top-level branch so `data` is read reactively, and idempotent because
	// it reruns on every navigation. Effects don't run on the server, so no `browser` guard.
	// static/count.js is GoatCounter's own script, vendored so it loads same-origin — gc.zgo.at is
	// on the usual tracker blocklists and a third-party fetch of it is silently dropped.
	$effect(() => {
		if (!data.goatcounterUrl || window.goatcounter) return;
		window.goatcounter = { endpoint: `${data.goatcounterUrl}/count`, path: reportedPath };

		const script = document.createElement('script');
		script.async = true;
		script.src = '/count.js';
		document.head.append(script);
	});

	// count.js only counts the load it arrived on, so client-side navigation has to report itself.
	// Blanking the referrer stops an internal hop from re-crediting whatever external link brought
	// the visitor to the site in the first place.
	afterNavigate(({ type }) => {
		if (type === 'enter') return;
		window.goatcounter?.count?.({ referrer: '' });
	});
</script>

<svelte:head>
	<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
	<link rel="preload" href={figtree400} as="font" type="font/woff2" crossorigin="anonymous" />
	<link rel="preload" href={figtree600} as="font" type="font/woff2" crossorigin="anonymous" />
	<link rel="preload" href={shantell600} as="font" type="font/woff2" crossorigin="anonymous" />
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
		--tape-2: #9bc59b;
		--wash-1: 196, 108, 54;
		--wash-2: 139, 158, 110;
		--shadow: rgba(43, 34, 22, 0.24);
		--cursor: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='34' height='34' viewBox='0 0 34 34'%3E%3Cpath d='M9 8 L9 29 L14.5 24 L18.5 32.5 L22.5 30.8 L18.5 22.5 L26 22.5 Z' fill='%23eec13e' stroke='%232b2216' stroke-width='2' stroke-linejoin='round'/%3E%3Cpath d='M6 5 L6 26 L11.5 21 L15.5 29.5 L19.5 27.8 L15.5 19.5 L23 19.5 Z' fill='%23dd3b2c' stroke='%232b2216' stroke-width='2.4' stroke-linejoin='round'/%3E%3C/svg%3E") 6 5, auto;
		--cursor-pointer: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='34' height='34' viewBox='0 0 34 34'%3E%3Cg stroke='%23dd3b2c' stroke-width='2.6' stroke-linecap='round'%3E%3Cline x1='11' y1='1.5' x2='11' y2='5.5'/%3E%3Cline x1='1.5' y1='10' x2='5.5' y2='10'/%3E%3Cline x1='3.5' y1='3' x2='6.5' y2='6'/%3E%3C/g%3E%3Cpath d='M13.5 12.5 L13.5 31.5 L18.5 27 L22 34 L25.5 33 L22 25.5 L28.5 25.5 Z' fill='%23dd3b2c' stroke='%232b2216' stroke-width='2' stroke-linejoin='round'/%3E%3Cpath d='M11 10 L11 29 L16 24.5 L19.5 32 L23 30.5 L19.5 23 L26 23 Z' fill='%23eec13e' stroke='%232b2216' stroke-width='2.4' stroke-linejoin='round'/%3E%3C/svg%3E") 11 10, pointer;
		--cursor-text: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='34' height='34' viewBox='0 0 34 34'%3E%3Cg fill='none' stroke-linecap='round'%3E%3Cpath d='M14 7 L22 7 M18 7 L18 31 M14 31 L22 31' stroke='%232b2216' stroke-width='6.5'/%3E%3Cpath d='M14 7 L22 7 M18 7 L18 31 M14 31 L22 31' stroke='%23eec13e' stroke-width='3'/%3E%3Cpath d='M12 5 L20 5 M16 5 L16 29 M12 29 L20 29' stroke='%232b2216' stroke-width='6.5'/%3E%3Cpath d='M12 5 L20 5 M16 5 L16 29 M12 29 L20 29' stroke='%23dd3b2c' stroke-width='3'/%3E%3C/g%3E%3C/svg%3E") 16 17, text;

		min-height: 100dvh;
		box-sizing: border-box;
		overflow-x: hidden;
		color-scheme: light;
		color: var(--ink);
		font-family: 'Figtree', system-ui, sans-serif;
		background-color: var(--bg);
		background-image:
			url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='260' height='260'%3E%3Cg fill='none' stroke='rgba(43,34,22,0.11)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M40 30 L44 40 L54 40 L46 46 L49 56 L40 50 L31 56 L34 46 L26 40 L36 40 Z' transform='rotate(-8 40 43)'/%3E%3Cpath d='M108 18 Q118 8 128 18 T148 18'/%3E%3Cpath d='M200 38 C196 32 186 34 186 44 C186 52 200 62 200 62 C200 62 214 52 214 44 C214 34 204 32 200 38 Z'/%3E%3Crect x='28' y='150' width='36' height='29' rx='3' transform='rotate(-6 46 164)'/%3E%3Ccircle cx='46' cy='163' r='8' transform='rotate(-6 46 164)'/%3E%3Ccircle cx='168' cy='172' r='9'/%3E%3Cline x1='168' y1='150' x2='168' y2='157'/%3E%3Cline x1='168' y1='187' x2='168' y2='194'/%3E%3Cline x1='145' y1='172' x2='152' y2='172'/%3E%3Cline x1='184' y1='172' x2='191' y2='172'/%3E%3Cpath d='M222 195 Q233 206 222 217 Q215 223 226 228'/%3E%3Cpath d='M95 95 Q100 85 110 90 Q116 93 112 100 Q108 106 100 103'/%3E%3Cpath d='M60 220 L64 228 L72 226 L67 233 L70 241 L62 237 L55 241 L57 233 L51 227 L59 229 Z' transform='rotate(10 62 231)'/%3E%3C/g%3E%3C/svg%3E"),
			radial-gradient(rgba(43, 34, 22, 0.055) 1px, transparent 1.3px),
			radial-gradient(rgba(43, 34, 22, 0.038) 1px, transparent 1.3px),
			radial-gradient(circle, rgba(var(--wash-1), 0.16), transparent 68%),
			radial-gradient(circle, rgba(var(--wash-2), 0.14), transparent 66%);
		background-size:
			260px 260px,
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
