<script lang="ts">
	import { formatDate, formatViews, initials } from '$lib/format';
	import { numberTape, sprite } from '$lib/asset_sheet';
	import { HELP_URL } from '$lib/help';

	let { data, form } = $props();

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

	type Video = (typeof data.videos)[number];

	let dialog = $state<HTMLDialogElement>();
	let pending = $state<Video | null>(null);
	let typed = $state('');

	function askDelete(video: Video) {
		pending = video;
		typed = '';
		dialog?.showModal();
	}

	const impactText: Record<string, string> = $derived({
		today: `This was today's video, so your streak goes back to ${Math.max(0, data.currentStreak - 1)}. You can still post another before 3am to keep it going.`,
		freeze:
			'This video kept your streak alive on a past day. Deleting it spends one of your streak freezes on that day and your streak drops by one.',
		break:
			'This video kept your streak alive on a past day and you have no freezes left. Deleting it BREAKS YOUR STREAK and resets it to 0.',
		none: "This video didn't count toward your streak, so your streak won't change."
	});

	const deletedText: Record<string, string> = {
		today: 'Video deleted. Post another before 3am to keep your streak going.',
		freeze: 'Video deleted. A streak freeze covered that day.',
		break: 'Video deleted. Your streak was reset.',
		none: 'Video deleted.'
	};
</script>

<svelte:head>
	<title>{data.name} · Day One Of</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="dash day-one">
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
						<span class="stat-value taped" style={numberTape('stat', 0)}>{data.currentStreak}</span>
						<span class="stat-label">day streak</span>
					</div>
					<div class="stat">
						<span class="stat-value taped" style={numberTape('stat', 1)}>{formatViews(data.totalViews)}</span>
						<span class="stat-label">views</span>
					</div>
					<div class="stat">
						<span class="stat-value taped" style={numberTape('stat', 2)}>{data.videosPosted}</span>
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

		{#if form?.deleted}
			<p class="notice">{deletedText[form.deleted]}</p>
		{:else if form?.deleteError}
			<p class="notice">
				{form.deleteError} Stuck? Ask in <a href={HELP_URL} target="_blank" rel="noopener">#dayoneof-help</a>.
			</p>
		{/if}

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
							<span class="play" aria-hidden="true"><span style={sprite('badge_arrow')}></span></span>
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
						{#if isMe && video.id}
							<button type="button" class="delete-btn" onclick={() => askDelete(video)}>Delete</button>
						{/if}
					</article>
				{/each}
			</div>
		{/if}
	</div>
</div>

{#if isMe}
	<dialog class="confirm day-one" bind:this={dialog} onclose={() => (pending = null)}>
		{#if pending}
			<form method="POST" action="?/deleteVideo">
				<h2>⚠️ Delete this video?</h2>
				<p class="warn">{impactText[pending.deleteImpact]}</p>
				<p>
					It disappears from the site, its views stop counting, and the bot's reply in Slack is
					deleted. You can't undo this yourself.
				</p>
				<input type="hidden" name="id" value={pending.id} />
				<label>
					Type <strong>DELETE</strong> to confirm
					<input name="confirm" autocomplete="off" bind:value={typed} />
				</label>
				<div class="confirm-actions">
					<button type="button" class="cancel-btn" onclick={() => dialog?.close()}>Keep it</button>
					<button type="submit" class="danger-btn" disabled={typed.trim().toUpperCase() !== 'DELETE'}>
						Delete video{pending.deleteImpact === 'break' ? ' and reset my streak' : ''}
					</button>
				</div>
			</form>
		{/if}
	</dialog>
{/if}

<style>
	.dash {
		--frame: clamp(1.5rem, 2.6vw, 3.25rem);
		--tile-gap: clamp(0.8rem, 1.3vw, 1.35rem);

		display: flex;
		flex-direction: column;
	}

	h1,
	h2 {
		font-family: var(--font-hand);
		font-weight: 700;
		margin: 0;
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
		font-family: var(--font-hand);
		font-weight: 700;
		font-size: clamp(1.6rem, 2.2vw, 2.4rem);
		color: var(--ink);
		text-decoration: none;
		white-space: nowrap;
	}

	.bar-right {
		display: flex;
		align-items: center;
		gap: clamp(0.75rem, 1.4vw, 1.5rem);
	}

	.ghost-btn {
		font-weight: 700;
		font-size: 0.95rem;
		color: var(--bg);
		background: var(--ink);
		border: 2px solid var(--ink);
		border-radius: 12px 6px 10px 6px/6px 12px 6px 10px;
		padding: calc(0.5rem - 3px) 1.2rem calc(0.5rem + 3px);
		text-decoration: none;
		white-space: nowrap;
		box-shadow: inset 0 -5px 0 var(--accent);
		transform: rotate(-1deg);
		transition:
			transform 0.15s ease,
			padding 0.15s ease,
			box-shadow 0.15s ease,
			filter 0.15s ease;
	}

	.ghost-btn:hover {
		filter: brightness(1.08);
	}

	.ghost-btn:active {
		padding: 0.5rem 1.2rem;
		box-shadow: none;
		transform: none;
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
		border: 3.5px solid transparent;
		box-shadow: 4px 5px 0 var(--shadow);
		object-fit: cover;
		background: var(--paper), var(--pencil);
	}

	.avatar-fallback {
		display: flex;
		align-items: center;
		justify-content: center;
		font-family: var(--font-hand);
		font-size: clamp(1.4rem, 2vw, 1.9rem);
		font-weight: 700;
		color: var(--ink-soft);
	}

	.who {
		display: flex;
		flex-direction: column;
		gap: clamp(0.4rem, 1vh, 0.75rem);
		min-width: 0;
	}

	.who h1 {
		font-size: clamp(1.6rem, 1vh + 1.6vw, 2.4rem);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.stats {
		display: flex;
		flex-wrap: wrap;
		gap: 10px;
	}

	.stat {
		display: flex;
		align-items: center;
		gap: 14px;
		background: var(--grain), var(--bg-2);
		border: 1.5px solid var(--line);
		border-radius: 999px;
		padding: 4px 12px 4px 4px;
	}

	.stat-value {
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		font-size: 0.95rem;
		color: var(--accent-ink);
		padding: 3px 12px;
	}

	.stat-label {
		font-size: 0.9rem;
		color: var(--ink-soft);
	}

	.feed-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		flex-wrap: wrap;
		gap: 12px;
	}

	.feed-head h2 {
		font-size: clamp(1.3rem, 1vh + 1vw, 1.9rem);
	}

	.segmented {
		display: flex;
		gap: 3px;
		padding: 3px;
		background: var(--paper), var(--pencil);
		border: 3px solid transparent;
		border-radius: 10px;
		box-shadow: 3px 3px 0 var(--shadow);
	}

	.segment {
		font: inherit;
		font-size: clamp(0.9rem, 1vw, 1.05rem);
		font-weight: 700;
		color: var(--ink-soft);
		background: none;
		border: none;
		border-radius: 7px;
		padding: 0.45rem 1.2rem;
		cursor: var(--cursor-pointer);
		transition:
			background-color 0.12s ease,
			color 0.12s ease;
	}

	.segment:hover {
		color: var(--ink);
	}

	.segment.active {
		background: var(--accent);
		color: var(--accent-ink);
	}

	.grid {
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		gap: var(--tile-gap);
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
		border: 3px solid transparent;
		border-radius: 15px 8px 12px 9px/9px 13px 8px 15px;
		overflow: hidden;
		background: linear-gradient(160deg, var(--bg) 0%, var(--bg-2) 100%) padding-box, var(--pencil);
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
		animation: flutter 0.6s ease forwards;
		box-shadow: 7px 8px 0 var(--shadow);
	}

	@keyframes flutter {
		30% {
			transform: rotate(-3deg) scale(1.02);
		}
		55% {
			transform: rotate(2deg) scale(1.03);
		}
		80% {
			transform: rotate(-0.8deg) scale(1.03);
		}
		100% {
			transform: rotate(0) scale(1.03);
		}
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
		background: var(--grain), var(--bg-2);
		opacity: 0.9;
		transition:
			transform 0.12s ease,
			opacity 0.12s ease;
	}

	.play span {
		position: absolute;
		inset: -14%;
	}

	.tile:hover .play {
		transform: translate(-50%, -50%) rotate(-12deg) scale(1.1);
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
		min-width: 0;
	}

	.platform {
		font-family: var(--font-hand);
		font-weight: 700;
		color: var(--ink);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.when {
		color: var(--ink-soft);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.delete-btn {
		align-self: flex-start;
		font: inherit;
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--accent);
		background: none;
		border: none;
		padding: 0;
		cursor: var(--cursor-pointer);
		text-decoration: underline;
	}

	.notice {
		margin: 0;
		font-weight: 700;
	}

	.confirm {
		min-height: 0;
		max-width: min(30rem, calc(100vw - 32px));
		border: 3px solid var(--accent);
		border-radius: 14px;
		padding: 1.5rem;
		background: var(--bg-2);
		box-shadow: 6px 7px 0 var(--shadow);
	}

	.confirm::backdrop {
		background: rgb(43 34 22 / 0.55);
	}

	.confirm form {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}

	.confirm h2 {
		color: var(--accent);
		font-size: 1.6rem;
	}

	.confirm p {
		margin: 0;
	}

	.warn {
		font-weight: 800;
		color: var(--accent);
		background: rgb(196 48 31 / 0.1);
		border-left: 4px solid var(--accent);
		padding: 0.6rem 0.8rem;
	}

	.confirm label {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
	}

	.confirm input {
		font: inherit;
		padding: 0.45rem 0.6rem;
		border: 2px solid var(--line);
		border-radius: 8px;
		background: var(--bg-2);
		cursor: var(--cursor-text);
	}

	.confirm-actions {
		display: flex;
		justify-content: flex-end;
		flex-wrap: wrap;
		gap: 0.6rem;
	}

	.cancel-btn,
	.danger-btn {
		font: inherit;
		font-weight: 700;
		border-radius: 10px;
		padding: 0.5rem 1rem;
		cursor: var(--cursor-pointer);
	}

	.cancel-btn {
		color: var(--ink);
		background: none;
		border: 2px solid var(--ink);
	}

	.danger-btn {
		color: var(--accent-ink);
		background: var(--accent);
		border: 2px solid var(--accent);
	}

	.danger-btn:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}

	.empty {
		color: var(--ink-soft);
		font-size: 1.1rem;
		margin: 0;
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
			animation: none;
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

		.bar,
		.bar-right {
			flex-wrap: wrap;
		}

		.profile {
			align-items: flex-start;
		}
	}
</style>
