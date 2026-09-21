<script lang="ts">
	import { page } from '$app/state';
</script>

<svelte:head>
	<title>{page.status} · Day One Of</title>
</svelte:head>

<main>
	<h1>{page.status === 404 ? "That page doesn't exist" : 'Something went wrong'}</h1>
	<p>{page.error?.message}</p>
	{#if page.status >= 500}
		<p>Ask for help in <strong>#dayoneof</strong> on Slack!</p>
	{/if}
	<a href="/">Back to the home page</a>
</main>
