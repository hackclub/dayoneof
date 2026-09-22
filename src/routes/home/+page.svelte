<script lang="ts">
	import { formatDate, formatViews, initials } from '$lib/format';

	let { data } = $props();

	type Sort = 'date' | 'views';
	type Tab = 'streak' | 'people' | 'videos';

	const sorts: { key: Sort; label: string }[] = [
		{ key: 'date', label: 'Newest' },
		{ key: 'views', label: 'Most viewed' }
	];

	const tabs: { key: Tab; label: string }[] = [
		{ key: 'streak', label: 'Longest streak' },
		{ key: 'people', label: 'Top creators' },
		{ key: 'videos', label: 'Top videos' }
	];

	let sort = $state<Sort>('date');
	let tab = $state<Tab>('people');

	const heading = $derived(sort === 'views' ? 'Most viewed reels' : 'Newest reels');

	const videos = $derived(
		sort === 'views' ? [...data.videos].sort((a, b) => b.views - a.views) : data.videos
	);
</script>

<svelte:head>
	<title>Day One Of</title>
</svelte:head>

<div class="dash day-one">
	<header class="bar">
		<a class="brand" href="/home">Day One Of</a>
		<div class="bar-right">
			<span class="posted torn-tape">{data.videosPosted} video{data.videosPosted === 1 ? '' : 's'} posted</span>
			{#if data.session}
				{#if data.name}
					<a class="who" href="/user/{data.session.slackId}">
						{#if data.avatar}
							<img class="avatar" src={data.avatar} alt="" width="32" height="32" />
						{:else}
							<span class="avatar avatar-fallback" aria-hidden="true">{initials(data.name)}</span>
						{/if}
						<span class="who-name">{data.name}</span>
					</a>
				{/if}
				<a class="ghost-btn" href="/api/auth/logout">Sign out</a>
			{:else}
				<a class="ghost-btn" href="/api/auth/login">Sign in with Hack Club</a>
			{/if}
		</div>
	</header>

	<div class="columns">
		<section class="feed">
			<div class="feed-head">
				<h1>{heading}</h1>
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
				<p class="empty">No videos yet. Post a link in the Slack channel to start the wall!</p>
			{:else}
				<div class="grid">
					{#each videos as video, i}
						<article class="card">
							<a class="tile" href={video.url} target="_blank" rel="noopener">
								{#if video.thumbnail}
									<!-- Lazy images inside the scrolling grid never start loading in Chrome until it
									     scrolls, so the first screenful is eager and the rest lazy. -->
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
								<a class="author" href="/user/{video.slackId}">{video.name}</a>
								<span class="when">{formatDate(video.postedAt)}</span>
							</div>
						</article>
					{/each}
				</div>
			{/if}
		</section>

		<aside class="board">
			<div class="tabs" role="group" aria-label="Leaderboard">
				{#each tabs as option}
					<button
						type="button"
						class="tab"
						class:active={tab === option.key}
						aria-pressed={tab === option.key}
						onclick={() => (tab = option.key)}
					>
						{option.label}
					</button>
				{/each}
			</div>

			{#if tab === 'streak'}
				<ol class="rows">
					{#each data.byStreak as person, i}
						<li class="row row-{i + 1}">
							<span class="rank rank-{i + 1}">{i + 1}</span>
							<a class="row-name" href="/user/{person.slackId}">
								<span class="row-title">{person.name}</span>
								{#if person.freezes}
									<span class="row-sub">{person.freezes} freeze{person.freezes === 1 ? '' : 's'} left</span>
								{/if}
							</a>
							<span class="row-value">{person.streak}d</span>
						</li>
					{:else}
						<li class="empty-row">Nobody's started a streak yet.</li>
					{/each}
				</ol>
			{:else if tab === 'people'}
				<ol class="rows">
					{#each data.byViews as person, i}
						<li class="row row-{i + 1}">
							<span class="rank rank-{i + 1}">{i + 1}</span>
							<a class="row-name" href="/user/{person.slackId}">
								<span class="row-title">{person.name}</span>
							</a>
							<span class="row-value">{formatViews(person.views)}</span>
						</li>
					{:else}
						<li class="empty-row">No views counted yet.</li>
					{/each}
				</ol>
			{:else}
				<ol class="rows">
					{#each data.byVideo as video, i}
						<li class="row row-{i + 1}">
							<span class="rank rank-{i + 1}">{i + 1}</span>
							<a class="row-name" href={video.url} target="_blank" rel="noopener">
								<span class="row-title">{video.title || video.platform}</span>
								<span class="row-sub">{video.name}</span>
							</a>
							<span class="row-value">{formatViews(video.views)}</span>
						</li>
					{:else}
						<li class="empty-row">No videos posted yet.</li>
					{/each}
				</ol>
			{/if}
		</aside>
	</div>
</div>

<style>
	.dash {
		--frame: clamp(1.5rem, 2.6vw, 3.25rem);
		--tile-gap: clamp(0.8rem, 1.3vw, 1.35rem);
		--meta-h: 1.45rem;
		/* Everything above the wall: bar, column padding, the feed heading and its gap. */
		--feed-chrome: clamp(11rem, 23.5vh, 15.5rem);
		/* Sized so two rows fit and the third peeks, which is what says "keep scrolling". */
		--peek: clamp(1.75rem, 4.4vh, 3.25rem);
		--tile-h: calc(
			(100dvh - var(--feed-chrome) - var(--peek) - 2 * var(--tile-gap) - 2 * var(--meta-h)) / 2
		);
		--tile-w: calc(var(--tile-h) * 9 / 16);
		--row-min: clamp(2.6rem, 4.6vh, 3.4rem);
		--row-max: clamp(3.4rem, 6.4vh, 4.6rem);

		display: flex;
		flex-direction: column;
		height: 100dvh;
	}

	h1 {
		font-family: 'Shantell Sans', 'Comic Sans MS', cursive;
		font-weight: 700;
		margin: 0;
	}

	.torn-tape {
		clip-path: polygon(
			3px 0,
			calc(100% - 3px) 0,
			100% 28%,
			calc(100% - 3px) 58%,
			100% 100%,
			3px 100%,
			0 58%,
			3px 28%
		);
		background-image: repeating-linear-gradient(
			48deg,
			rgba(255, 255, 255, 0.32) 0 2px,
			transparent 2px 7px
		);
		background-blend-mode: overlay;
	}

	.bar {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 16px;
		padding: clamp(0.9rem, 2.1vh, 1.6rem) var(--frame);
		border-bottom: 2px solid var(--line);
	}

	.brand {
		font-family: 'Shantell Sans', 'Comic Sans MS', cursive;
		font-weight: 700;
		font-size: clamp(1.6rem, 2.2vw, 2.4rem);
		color: var(--ink);
		text-decoration: underline wavy var(--accent) 2px;
		text-underline-offset: 7px;
	}

	.bar-right {
		display: flex;
		align-items: center;
		gap: clamp(0.75rem, 1.4vw, 1.5rem);
		min-width: 0;
	}

	.posted {
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		background-color: var(--tape);
		color: var(--ink);
		padding: 6px 12px;
		transform: rotate(-2deg);
		white-space: nowrap;
	}

	.who {
		display: flex;
		align-items: center;
		gap: 0.55rem;
		font-weight: 700;
		font-size: clamp(1rem, 1.1vw, 1.2rem);
		color: var(--ink);
		text-decoration: none;
		min-width: 0;
	}

	.who-name {
		max-width: clamp(6rem, 14vw, 14rem);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.avatar {
		flex: 0 0 auto;
		width: clamp(1.9rem, 2.2vw, 2.4rem);
		height: clamp(1.9rem, 2.2vw, 2.4rem);
		border-radius: 50%;
		border: 2px solid var(--ink);
		object-fit: cover;
		background: var(--bg-2);
	}

	.avatar-fallback {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--ink-soft);
	}

	.who:hover {
		color: var(--accent);
	}

	.ghost-btn {
		font-weight: 700;
		font-size: 0.95rem;
		color: var(--bg);
		background: var(--ink);
		border: 2px solid var(--ink);
		border-radius: 10px;
		padding: 0.5rem 1.2rem;
		text-decoration: none;
		white-space: nowrap;
		box-shadow: 3px 3px 0 var(--accent);
		transition:
			transform 0.12s ease,
			box-shadow 0.12s ease;
	}

	.ghost-btn:hover {
		transform: translate(-2px, -2px);
		box-shadow: 5px 5px 0 var(--accent);
	}

	.ghost-btn:active {
		transform: translate(0, 0);
		box-shadow: 1px 1px 0 var(--accent);
	}

	.columns {
		display: grid;
		grid-template-columns: minmax(0, 1fr) clamp(23rem, 27vw, 32rem);
		gap: clamp(1.25rem, 2.2vw, 2.75rem);
		flex: 1 1 auto;
		min-height: 0;
		padding: clamp(1.75rem, 4.4vh, 3.5rem) var(--frame) clamp(1rem, 2.2vh, 1.75rem);
	}

	.feed {
		display: flex;
		flex-direction: column;
		min-width: 0;
		min-height: 0;
		gap: clamp(0.6rem, 1.6vh, 1.25rem);
	}

	.feed-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 12px;
	}

	.feed-head h1 {
		font-size: clamp(1.45rem, 1vh + 1.1vw, 2.1rem);
	}

	.segmented,
	.tabs {
		display: flex;
		gap: 3px;
		padding: 3px;
		background: var(--bg-2);
		border: 2px solid var(--ink);
		border-radius: 10px;
		box-shadow: 3px 3px 0 var(--shadow);
	}

	.segment,
	.tab {
		font: inherit;
		font-weight: 700;
		color: var(--ink-soft);
		background: none;
		border: none;
		border-radius: 7px;
		cursor: var(--cursor-pointer);
		transition:
			background-color 0.12s ease,
			color 0.12s ease;
	}

	.segment {
		font-size: clamp(0.9rem, 1vw, 1.05rem);
		padding: 0.45rem 1.2rem;
	}

	.segment:hover,
	.tab:hover {
		color: var(--ink);
	}

	.segment.active,
	.tab.active {
		background: var(--accent);
		color: var(--accent-ink);
	}

	/* Five fixed columns: tile width follows the column, and 9:16 gives the height, so tracks never
	   stretch — a wall of three videos keeps the same tiles as a wall of thirty. */
	.grid {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		grid-auto-rows: max-content;
		align-content: start;
		gap: var(--tile-gap);
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
		padding: 6px 12px 12px 4px;
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		width: 100%;
		min-width: 0;
	}

	.tile {
		position: relative;
		display: block;
		width: 100%;
		aspect-ratio: 9 / 16;
		border: 2px solid var(--ink);
		border-radius: 15px 8px 12px 9px/9px 13px 8px 15px;
		overflow: hidden;
		background: linear-gradient(160deg, var(--bg) 0%, var(--bg-2) 100%);
		box-shadow: 4px 5px 0 var(--shadow);
		text-decoration: none;
		transition:
			transform 0.12s ease,
			box-shadow 0.12s ease;
	}

	.card:nth-child(odd) .tile {
		transform: rotate(-1deg);
	}

	.card:nth-child(even) .tile {
		transform: rotate(1deg);
	}

	.card .tile:hover {
		transform: translate(-2px, -3px);
		box-shadow: 7px 8px 0 var(--shadow);
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
		background: var(--bg-2);
		border: 2px solid var(--ink);
		opacity: 0.85;
		transition:
			transform 0.12s ease,
			opacity 0.12s ease;
	}

	.play svg {
		width: 55%;
		height: 55%;
		margin-left: 6%;
		fill: var(--accent);
		stroke: var(--accent);
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
		/* Reels are often bright at the bottom edge — white on a thin veil disappears entirely, so
		   the scrim goes near-opaque at the base and the type carries its own shadow. */
		background: linear-gradient(
			to top,
			rgb(43 34 22 / 0.94),
			rgb(43 34 22 / 0.72) 45%,
			rgb(43 34 22 / 0.3) 75%,
			transparent
		);
		color: var(--accent-ink);
		text-shadow: 0 1px 3px rgb(43 34 22 / 0.9);
	}

	.tile-title {
		font-size: clamp(0.9rem, 0.95vw, 1.1rem);
		font-weight: 700;
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
		gap: 8px;
		font-size: clamp(0.9rem, 0.95vw, 1.05rem);
		height: var(--meta-h);
		min-width: 0;
	}

	.author {
		font-family: 'Shantell Sans', cursive;
		font-weight: 700;
		color: var(--ink);
		text-decoration: none;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.author:hover {
		color: var(--accent);
	}

	.when {
		color: var(--ink-soft);
		white-space: nowrap;
	}

	.empty {
		color: var(--ink-soft);
		font-size: 1.1rem;
		margin: 16px 0 0;
	}

	.board {
		display: flex;
		flex-direction: column;
		min-height: 0;
		gap: clamp(0.6rem, 1.4vh, 1.1rem);
		background: var(--bg-2);
		border: 2px solid var(--ink);
		border-radius: 12px 6px 10px 6px/6px 12px 6px 10px;
		box-shadow: 4px 5px 0 var(--shadow);
		padding: clamp(0.75rem, 1.6vh, 1.25rem);
		transform: rotate(0.6deg);
	}

	.tab {
		flex: 1 1 0;
		font-size: clamp(0.85rem, 0.92vw, 1rem);
		padding: 0.5rem 0.4rem;
	}

	/* Rows share the panel height, but only up to --row-max — without the cap a board with two
	   people on it renders two pills the height of the panel. */
	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		flex: 1 1 auto;
		min-height: 0;
		overflow-y: auto;
	}

	.row {
		display: flex;
		align-items: center;
		gap: clamp(0.7rem, 1.1vw, 1.1rem);
		flex: 1 1 auto;
		min-height: var(--row-min);
		max-height: var(--row-max);
		border-top: 1px dashed var(--line);
		padding: 0.3rem 0.55rem;
		min-width: 0;
	}

	.row:first-child {
		border-top: none;
	}

	.row-1 .row-title {
		font-size: 1.08em;
	}

	.row-1 .row-value {
		background: var(--accent);
		color: var(--accent-ink);
		padding: 3px 10px;
		border-radius: 999px;
	}

	.rank {
		flex: 0 0 auto;
		width: 1.6rem;
		text-align: right;
		font-family: 'Shantell Sans', cursive;
		font-weight: 700;
		color: var(--ink-soft);
		font-variant-numeric: tabular-nums;
		font-size: clamp(0.9rem, 1.5vh, 1.15rem);
	}

	.rank-1 {
		color: var(--accent);
	}

	.row-name {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-direction: column;
		font-weight: 700;
		font-size: clamp(1rem, 1.8vh, 1.3rem);
		color: var(--ink);
		text-decoration: none;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-name:hover {
		color: var(--accent);
	}

	.row-value {
		flex: 0 0 auto;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		font-size: clamp(1rem, 1.8vh, 1.3rem);
		color: var(--ink);
	}

	.row-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-sub {
		font-weight: 400;
		font-size: clamp(0.8rem, 1.3vh, 0.95rem);
		color: var(--ink-soft);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.empty-row {
		color: var(--ink-soft);
		font-size: 1rem;
		padding: 8px;
	}

	:global(.dash a:focus-visible),
	:global(.dash button:focus-visible) {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}

	@media (prefers-reduced-motion: reduce) {
		.tile,
		.play,
		.ghost-btn {
			transition: none;
		}

		.card .tile:hover {
			transform: none;
		}

		.tile:hover .play {
			transform: translate(-50%, -50%);
		}
	}

	@media (max-width: 60rem) {
		.dash {
			height: auto;
			min-height: 100dvh;
		}

		.columns {
			grid-template-columns: minmax(0, 1fr);
		}

		.grid,
		.rows {
			overflow-y: visible;
		}

		.row {
			flex: 0 0 auto;
		}

		.board {
			order: -1;
			transform: none;
		}
	}
</style>
