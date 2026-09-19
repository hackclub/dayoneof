<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>Top videos · Day One Of</title>
</svelte:head>

<main>
	<h1>Top videos</h1>
	<ol>
		{#each data.videos as v}
			<li>
				<a href={v.url} target="_blank" rel="noopener">{v.platform}</a>
				by <a href="/user/{v.slackId}">{v.name}</a>
				· {v.views} views · {v.likes} likes
			</li>
		{/each}
	</ol>
</main>
