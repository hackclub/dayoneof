<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>Day One Of</title>
</svelte:head>

<main>
	<h1>Day One Of</h1>
	<p>
		Post one video a day of you working on your thing — coding, building, drawing, whatever
		"day one" of your thing looks like. Keep the streak alive, earn a freeze every couple of
		days for when life happens, and hit milestones at 2, 7, 15, and 25 days.
	</p>

	{#if data.session}
		<p>You're signed in. Post a link in the Slack channel to log today.</p>
	{:else}
		<a href="/api/auth/login">Sign in with Hack Club</a>
	{/if}

	<nav>
		<a href="/leaderboard">Leaderboard</a>
		<a href="/gallery">Gallery</a>
		{#if data.isAdmin}
			<a href="/admin">Admin</a>
		{/if}
	</nav>
</main>
