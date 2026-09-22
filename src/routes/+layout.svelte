<script lang="ts">
	import { afterNavigate } from '$app/navigation';
	import favicon from '$lib/assets/favicon.svg';

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
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

<style>
	@font-face {
		font-family: 'Phantom Sans';
		src:
			url('https://assets.hackclub.com/fonts/Phantom_Sans_0.7/Regular.woff2') format('woff2'),
			url('https://assets.hackclub.com/fonts/Phantom_Sans_0.7/Regular.woff') format('woff');
		font-weight: normal;
		font-style: normal;
		font-display: swap;
	}
	@font-face {
		font-family: 'Phantom Sans';
		src:
			url('https://assets.hackclub.com/fonts/Phantom_Sans_0.7/Bold.woff2') format('woff2'),
			url('https://assets.hackclub.com/fonts/Phantom_Sans_0.7/Bold.woff') format('woff');
		font-weight: bold;
		font-style: normal;
		font-display: swap;
	}

	:global(:root) {
		--darker: #121217;
		--dark: #17171d;
		--black: #1f2d3d;
		--steel: #273444;
		--slate: #3c4858;
		--muted: #8492a6;
		--smoke: #e0e6ed;
		--snow: #f9fafc;
		--white: #ffffff;
		--red: #ec3750;
		--orange: #ff8c37;
		--yellow: #f1c40f;
		--green: #33d6a6;
		--cyan: #5bc0de;
		--blue: #338eda;
		--purple: #a633d6;

		--text: var(--black);
		--heading: var(--darker);
		--secondary: var(--slate);
		--accent: var(--blue);
		--background: var(--white);
		--sheet: var(--snow);
		--border: var(--smoke);

		--accent-glow: rgb(51 142 218 / 0.2);
		--accent-veil: rgb(51 142 218 / 0.85);

		--ease-out: cubic-bezier(0.22, 1, 0.36, 1);
		--transition-hover: 0.15s ease-in-out;
		--transition-press: 0.125s ease-in-out;

		--space-1: clamp(2px, 0.5vh, 4px);
		--space-2: clamp(4px, 1vh, 8px);
		--space-3: clamp(6px, 1.6vh, 14px);
		--space-4: clamp(12px, 3.2vh, 28px);
		--space-5: clamp(20px, 5vh, 44px);
		--stack: clamp(10px, 2.6vh, 24px);
		--stack-lg: clamp(16px, 4.4vh, 40px);
		--gutter: clamp(1.5rem, 3vw, 3rem);
		--radius: 8px;
		--radius-lg: 16px;
		--radius-pill: 9999px;
	}

	:global(html, body) {
		margin: 0;
		padding: 0;
		background: var(--background);
	}

	:global(body) {
		font-family: 'Phantom Sans', system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
		color: var(--text);
	}
</style>
