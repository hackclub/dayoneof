<script lang="ts">
	import { formatDate, formatViews, initials } from '$lib/format';

	let { data } = $props();

	type Sort = 'date' | 'views';

	const sorts: { key: Sort; label: string }[] = [
		{ key: 'date', label: 'Newest' },
		{ key: 'views', label: 'Most viewed' }
	];

	let sort = $state<Sort>('date');

	const isMe = $derived(data.session?.slackId === data.slackId);

	const videos = $derived(
		sort === 'views' ? [...data.videos].sort((a, b) => b.views - a.views) : data.videos
	);
</script>

<svelte:head>
	<title>{data.name} · Day One Of</title>
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,900&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="dash">
	<header class="bar">
		<a class="brand" href="/home">Day One Of</a>
		<div class="bar-right">
			{#if data.session}
				<a class="ghost-btn" href="/api/auth/logout">Sign out</a>
			{:else}
				<a class="ghost-btn" href="/api/auth/login">Sign in with Hack Club</a>
			{/if}
		</div>
	</header>

	<div class="frame">
		<section class="profile">
			{#if data.avatar}
				<img class="avatar" src={data.avatar} alt="" width="88" height="88" />
			{:else}
				<span class="avatar avatar-fallback" aria-hidden="true">{initials(data.name)}</span>
			{/if}
			<div class="who">
				<h1>{data.name}</h1>
				<div class="stats">
					<div class="stat">
						<span class="stat-value">{data.currentStreak}</span>
						<span class="stat-label">day streak</span>
					</div>
					<div class="stat">
						<span class="stat-value">{formatViews(data.totalViews)}</span>
						<span class="stat-label">views</span>
					</div>
					<div class="stat">
						<span class="stat-value">{data.videosPosted}</span>
						<span class="stat-label">video{data.videosPosted === 1 ? '' : 's'}</span>
					</div>
				</div>
			</div>
		</section>

		<div class="feed-head">
			<h2>{isMe ? 'Your videos' : 'Videos'}</h2>
			<div class="segmented" role="group" aria-label="Sort videos">
				{#each sorts as option}
					<button
						type="button"
						class="segment"
						class:active={sort === option.key}
						aria-pressed={sort === option.key}
						onclick={() => (sort = option.key)}
					>
						{option.label}
					</button>
				{/each}
			</div>
		</div>

		{#if videos.length === 0}
			<p class="empty">No videos yet.</p>
		{:else}
			<div class="grid">
				{#each videos as video, i}
					<article class="card">
						<a class="tile" href={video.url} target="_blank" rel="noopener">
							{#if video.thumbnail}
								<img
									class="thumb"
									src={video.thumbnail}
									alt=""
									loading={i < 12 ? 'eager' : 'lazy'}
									decoding="async"
								/>
							{/if}
							<span class="play" aria-hidden="true">
								<svg viewBox="0 0 24 24">
									<path d="M9.5 7.6l7.2 4.4-7.2 4.4z" />
								</svg>
							</span>
							<span class="tile-foot">
								{#if video.title}<span class="tile-title">{video.title}</span>{/if}
								<span class="tile-views">{formatViews(video.views)} views</span>
							</span>
						</a>
						<div class="meta">
							<span class="platform">{video.platform}</span>
							<span class="when">
								{formatDate(video.postedAt)}
								{#if !video.countedTowardStreak}· didn't count{/if}
							</span>
						</div>
					</article>
				{/each}
			</div>
		{/if}
	</div>
</div>

<style>
	.dash {
		--frame: clamp(1.5rem, 2.6vw, 3.25rem);
		--tile-gap: clamp(0.6rem, 1.1vw, 1.15rem);

		display: flex;
		flex-direction: column;
		min-height: 100dvh;
		background: var(--background);
	}

	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-4);
		padding: clamp(0.9rem, 2.1vh, 1.6rem) var(--frame);
		border-bottom: 1px solid var(--border);
		background: var(--background);
	}

	.brand {
		font-family: 'Playfair Display', Georgia, 'Times New Roman', serif;
		font-style: italic;
		font-weight: 900;
		font-size: clamp(1.75rem, 2.5vw, 2.9rem);
		letter-spacing: -0.01em;
		color: var(--heading);
		text-decoration: none;
	}

	.bar-right {
		display: flex;
		align-items: center;
		gap: clamp(0.75rem, 1.4vw, 1.5rem);
	}

	.ghost-btn {
		font-weight: bold;
		font-size: clamp(0.95rem, 1.05vw, 1.15rem);
		color: var(--accent);
		background: var(--background);
		border: 2px solid var(--accent);
		border-radius: var(--radius);
		padding: 0.5rem 1.4rem;
		text-decoration: none;
		white-space: nowrap;
		transition:
			background-color var(--transition-hover),
			color var(--transition-hover);
	}

	.ghost-btn:hover {
		background: var(--accent);
		color: var(--white);
	}

	.frame {
		display: flex;
		flex-direction: column;
		gap: clamp(1.5rem, 3.2vh, 2.75rem);
		flex: 1 1 auto;
		padding: clamp(1.75rem, 4.4vh, 3.5rem) var(--frame);
	}

	.profile {
		display: flex;
		align-items: center;
		gap: clamp(1rem, 2vw, 1.75rem);
	}

	.avatar {
		flex: 0 0 auto;
		width: clamp(4.25rem, 6vw, 5.5rem);
		height: clamp(4.25rem, 6vw, 5.5rem);
		border-radius: 50%;
		object-fit: cover;
		background: var(--smoke);
	}

	.avatar-fallback {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: clamp(1.4rem, 2vw, 1.9rem);
		font-weight: bold;
		color: var(--slate);
	}

	.who {
		display: flex;
		flex-direction: column;
		gap: clamp(0.4rem, 1vh, 0.75rem);
		min-width: 0;
	}

	.who h1 {
		margin: 0;
		font-size: clamp(1.6rem, 1vh + 1.6vw, 2.4rem);
		color: var(--heading);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.stats {
		display: flex;
		gap: clamp(1.25rem, 2.4vw, 2.25rem);
	}

	.stat {
		display: flex;
		flex-direction: column;
	}

	.stat-value {
		font-weight: bold;
		font-variant-numeric: tabular-nums;
		font-size: clamp(1.15rem, 1.4vw, 1.5rem);
		color: var(--heading);
	}

	.stat-label {
		font-size: clamp(0.85rem, 0.95vw, 1rem);
		color: var(--secondary);
	}

	.feed-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: var(--space-3);
	}

	.feed-head h2 {
		margin: 0;
		font-size: clamp(1.3rem, 1vh + 1vw, 1.9rem);
		color: var(--heading);
	}

	.segmented {
		display: flex;
		gap: 2px;
		padding: 3px;
		background: var(--sheet);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.segment {
		font-family: inherit;
		font-size: clamp(0.9rem, 1vw, 1.1rem);
		font-weight: bold;
		color: var(--secondary);
		background: none;
		border: none;
		border-radius: calc(var(--radius) - 3px);
		padding: 0.5rem 1.3rem;
		cursor: pointer;
		transition:
			background-color var(--transition-hover),
			color var(--transition-hover);
	}

	.segment:hover {
		color: var(--heading);
	}

	.segment.active {
		background: var(--accent);
		color: var(--white);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: var(--tile-gap);
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		width: 100%;
		min-width: 0;
	}

	.tile {
		position: relative;
		display: block;
		width: 100%;
		aspect-ratio: 9 / 16;
		border-radius: var(--radius-lg);
		overflow: hidden;
		background: linear-gradient(160deg, var(--steel), var(--darker));
		text-decoration: none;
		transition:
			transform var(--transition-hover),
			box-shadow var(--transition-hover);
	}

	.tile:hover {
		transform: translateY(-4px);
		box-shadow: 0 14px 30px rgb(18 18 23 / 0.3);
	}

	.thumb {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.play {
		position: absolute;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: clamp(2.1rem, 3.2vh, 2.9rem);
		height: clamp(2.1rem, 3.2vh, 2.9rem);
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: rgb(18 18 23 / 0.32);
		border: 1.5px solid rgb(255 255 255 / 0.75);
		opacity: 0.8;
		backdrop-filter: blur(2px);
		transition:
			transform var(--transition-hover),
			opacity var(--transition-hover);
	}

	.play svg {
		width: 55%;
		height: 55%;
		margin-left: 6%;
		fill: var(--white);
		stroke: var(--white);
		stroke-width: 2.4;
		stroke-linejoin: round;
	}

	.tile:hover .play {
		transform: translate(-50%, -50%) scale(1.1);
		opacity: 1;
	}

	.tile-foot {
		position: absolute;
		inset: auto 0 0 0;
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		padding: clamp(1.6rem, 3.4vh, 2.6rem) 0.75rem 0.65rem;
		background: linear-gradient(
			to top,
			rgb(18 18 23 / 0.94),
			rgb(18 18 23 / 0.72) 45%,
			rgb(18 18 23 / 0.3) 75%,
			transparent
		);
		color: var(--white);
		text-shadow: 0 1px 3px rgb(18 18 23 / 0.9);
	}

	.tile-title {
		font-size: clamp(0.9rem, 0.95vw, 1.1rem);
		font-weight: bold;
		line-height: 1.25;
		overflow-wrap: anywhere;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.tile-views {
		font-size: clamp(0.85rem, 0.9vw, 1.05rem);
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		opacity: 0.92;
	}

	.meta {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: var(--space-2);
		font-size: clamp(0.9rem, 0.95vw, 1.1rem);
		min-width: 0;
	}

	.platform {
		font-weight: bold;
		color: var(--heading);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.when {
		color: var(--muted);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.empty {
		color: var(--secondary);
		font-size: 1.15rem;
		margin: 0;
	}

	:global(.dash a:focus-visible),
	:global(.dash button:focus-visible) {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
		border-radius: var(--radius);
	}

	@media (prefers-reduced-motion: reduce) {
		.tile {
			transition: none;
		}

		.tile:hover {
			transform: none;
		}
	}

	@media (max-width: 60rem) {
		.grid {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}

	@media (max-width: 30rem) {
		.grid {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}

		.profile {
			align-items: flex-start;
		}
	}
</style>
