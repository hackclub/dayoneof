<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>Leaderboard · Day One Of</title>
</svelte:head>

<main>
	<h1>Leaderboard</h1>

	<section>
		<h2>Longest active streaks</h2>
		<ol>
			{#each data.byStreak as p}
				<li>{p.name} — {p.streak} days ({p.freezes} freezes left)</li>
			{/each}
		</ol>
	</section>

	<section>
		<h2>Most total views</h2>
		<ol>
			{#each data.byViews as p}
				<li>{p.name} — {p.views} views</li>
			{/each}
		</ol>
	</section>
</main>
