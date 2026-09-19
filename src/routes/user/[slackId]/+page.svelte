<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>{data.name} · Day One Of</title>
</svelte:head>

<main>
	<h1>{data.name}</h1>
	<p>
		{data.currentStreak} day streak · {data.streakFreezes} freezes · {data.totalViews} total views
	</p>
	<p>{data.videosPosted} video{data.videosPosted === 1 ? '' : 's'} posted</p>

	<h2>Posts</h2>
	<ul>
		{#each data.submissions as s}
			<li>
				<a href={s.url} target="_blank" rel="noopener">{s.platform}</a>
				· {s.views} views · {s.likes} likes
				{#if !s.countedTowardStreak}(didn't count){/if}
			</li>
		{/each}
	</ul>
</main>
