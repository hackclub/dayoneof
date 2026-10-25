<script lang="ts">
	let {
		platforms,
		value = $bindable()
	}: {
		platforms: { platform: string }[];
		value?: string;
	} = $props();

	// Unpicked means the first platform, which the server sorts to the most viewed.
	const current = $derived(value || platforms[0]?.platform);

	const names: Record<string, string> = { youtube: 'YouTube', tiktok: 'TikTok', instagram: 'Instagram' };

	// Simplified brand marks on a 24×24 grid.
	const icons: Record<string, string> = {
		youtube:
			'M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.6 12 3.6 12 3.6s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 31.3 31.3 0 0 0 0 12a31.3 31.3 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.1A31.3 31.3 0 0 0 24 12a31.3 31.3 0 0 0-.5-5.8zM9.6 15.6V8.4l6.3 3.6-6.3 3.6z',
		tiktok:
			'M12.5 0h4a6.1 6.1 0 0 0 1.7 4.2A6 6 0 0 0 22 6v4a10 10 0 0 1-5.4-1.7v7.6a7.3 7.3 0 1 1-7.3-7.3c.4 0 .8 0 1.2.1v4.1a3.3 3.3 0 1 0 2.1 3.1z',
		instagram:
			'M12 2.2c3.2 0 3.6 0 4.8.1 3.3.1 4.8 1.7 4.9 4.9.1 1.3.1 1.6.1 4.8s0 3.6-.1 4.8c-.1 3.2-1.7 4.8-4.9 4.9-1.3.1-1.6.1-4.8.1s-3.6 0-4.8-.1c-3.3-.1-4.8-1.7-4.9-4.9C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.8C2.4 3.9 3.9 2.4 7.2 2.3 8.4 2.2 8.8 2.2 12 2.2zM12 0C8.7 0 8.3 0 7.1.1 2.7.3.3 2.7.1 7.1 0 8.3 0 8.7 0 12s0 3.7.1 4.9c.2 4.4 2.6 6.8 7 7 1.2.1 1.6.1 4.9.1s3.7 0 4.9-.1c4.4-.2 6.8-2.6 7-7 .1-1.2.1-1.6.1-4.9s0-3.7-.1-4.9c-.2-4.4-2.6-6.8-7-7C15.7 0 15.3 0 12 0zm0 5.8a6.2 6.2 0 1 0 0 12.4 6.2 6.2 0 0 0 0-12.4zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.4-11.8a1.4 1.4 0 1 0 0 2.9 1.4 1.4 0 0 0 0-2.9z'
	};
</script>

<span class="platforms" role="group" aria-label="Platforms">
	{#each platforms as { platform }}
		<button
			type="button"
			class="platform"
			class:active={current === platform}
			aria-pressed={current === platform}
			aria-label={names[platform] ?? platform}
			title={names[platform] ?? platform}
			onclick={() => (value = platform)}
		>
			<svg viewBox="0 0 24 24" aria-hidden="true"><path d={icons[platform] ?? ''} /></svg>
		</button>
	{/each}
</span>

<style>
	.platforms {
		display: inline-flex;
		align-items: center;
		align-self: center;
		gap: 0.15rem;
		flex: 0 0 auto;
	}

	.platform {
		display: flex;
		padding: 0.15rem;
		background: none;
		border: none;
		border-radius: 5px;
		color: var(--ink-soft);
		opacity: 0.55;
		cursor: var(--cursor-pointer);
		transition:
			color 0.12s ease,
			opacity 0.12s ease;
	}

	.platform:hover {
		opacity: 0.85;
	}

	.platform.active {
		color: var(--accent);
		opacity: 1;
	}

	svg {
		width: 0.95em;
		height: 0.95em;
		fill: currentColor;
	}
</style>
