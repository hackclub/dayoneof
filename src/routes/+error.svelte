<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>{page.status} · Day One Of</title>
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
		background: var(--bg-2);
		border: 2px solid var(--ink);
		border-radius: 22px 10px 18px 12px/12px 20px 10px 24px;
		box-shadow: 4px 5px 0 var(--shadow);
		padding: 28px 30px;
		transform: rotate(-0.8deg);
	}

	h1 {
		font-family: 'Shantell Sans', 'Comic Sans MS', cursive;
		font-weight: 700;
		font-size: clamp(1.6rem, 2vw + 1rem, 2.2rem);
		margin: 0 0 4px;
		text-decoration: underline wavy var(--accent) 2px;
		text-underline-offset: 7px;
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
		border-radius: 10px;
		padding: 10px 18px;
		text-decoration: none;
		box-shadow: 3px 3px 0 var(--accent);
		transition:
			transform 0.12s ease,
			box-shadow 0.12s ease;
	}

	a:hover {
		transform: translate(-2px, -2px);
		box-shadow: 5px 5px 0 var(--accent);
	}
</style>
