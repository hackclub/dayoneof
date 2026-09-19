<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>Gallery · Day One Of</title>
</svelte:head>

<main>
	<h1>Gallery</h1>
	<ul>
		{#each data.items as item}
			<li>
				<strong>{item.name}</strong> · {item.platform} ·
				<a href={item.url} target="_blank" rel="noopener">watch</a>
				· {item.views} views
			</li>
		{/each}
	</ul>
</main>
