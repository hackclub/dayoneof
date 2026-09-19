<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>Gallery · Day One Of</title>
</svelte:head>

<main>
	<h1>Gallery</h1>
	<nav>
		<a href="/gallery?sort=date" aria-current={data.sort === 'date' ? 'page' : undefined}>Newest</a>
		<a href="/gallery?sort=views" aria-current={data.sort === 'views' ? 'page' : undefined}>Highest views</a>
	</nav>
	<ul>
		{#each data.items as item}
			<li>
				<strong><a href="/user/{item.slackId}">{item.name}</a></strong> · {item.platform} ·
				<a href={item.url} target="_blank" rel="noopener">watch</a>
				· {item.views} views
			</li>
		{/each}
	</ul>
</main>
