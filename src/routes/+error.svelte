<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>{page.status} · Day One Of</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="day-one">
	<main class="card">
		<h1>{page.status === 404 ? "That page doesn't exist" : 'Something went wrong'}</h1>
		<p>{page.error?.message}</p>
		{#if page.status >= 500}
			<p>Ask for help in <strong>#dayoneof</strong> on Slack!</p>
		{/if}
		<a href="/">Back to the home page</a>
	</main>
</div>

<style>
	.day-one {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 20px;
	}

	.card {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 12px;
		max-width: 32rem;
		background: var(--paper), var(--pencil);
		border: 3px solid transparent;
		border-radius: 22px 10px 18px 12px/12px 20px 10px 24px;
		box-shadow: 4px 5px 0 var(--shadow);
		padding: 28px 30px;
		transform: rotate(-0.8deg);
	}

	h1 {
		font-family: var(--font-hand);
		font-weight: 700;
		font-size: clamp(1.6rem, 2vw + 1rem, 2.2rem);
		margin: 0 0 4px;
	}

	p {
		margin: 0;
		color: var(--ink-soft);
		line-height: 1.5;
	}

	strong {
		color: var(--ink);
	}

	a {
		margin-top: 8px;
		font-weight: 700;
		color: var(--bg);
		background: var(--ink);
		border: 2px solid var(--ink);
		border-radius: 12px 6px 10px 6px/6px 12px 6px 10px;
		padding: 7px 18px 13px;
		text-decoration: none;
		box-shadow: inset 0 -5px 0 var(--accent);
		transform: rotate(-1deg);
		transition:
			transform 0.15s ease,
			padding 0.15s ease,
			box-shadow 0.15s ease,
			filter 0.15s ease;
	}

	a:hover {
		filter: brightness(1.08);
	}

	a:active {
		padding: 10px 18px;
		box-shadow: none;
		transform: none;
	}
</style>
