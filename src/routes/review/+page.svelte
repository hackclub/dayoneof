<script lang="ts">
	import { enhance } from '$app/forms';
	import { formatDate, formatViews } from '$lib/format';

	let { data, form } = $props();

	type Details = { caption: string; note: string };

	let index = $state(0);
	let feedback = $state('');
	let busy = $state(false);
	let archiveFailed = $state<Record<string, boolean>>({});
	let details = $state<Record<string, Details | null>>({});

	const count = $derived(data.videos.length);
	const at = $derived(Math.min(index, Math.max(0, count - 1)));
	const video = $derived(data.videos[at]);
	const prev = $derived(at > 0 ? data.videos[at - 1] : null);
	const next = $derived(at < count - 1 ? data.videos[at + 1] : null);
	const useArchive = $derived(!!video?.archiveUrl && !archiveFailed[video.id]);

	const impactText: Record<string, (r: { streak: number; freezes: number }) => string> = {
		today: (r) => `It's today's video: their streak drops to ${r.streak}, and they can repost before 3am.`,
		freeze: (r) =>
			`It's from a past day: a freeze covers it, and their streak drops to ${r.streak} with ${r.freezes} freeze${r.freezes === 1 ? '' : 's'} left.`,
		break: () => 'It\'s from a past day and they have no freezes left, so their streak resets to 0.',
		none: () => "It didn't count toward their streak, so their streak won't change."
	};

	async function loadDetails(id: string | undefined) {
		if (!id || id in details) return;
		details[id] = null;
		const res = await fetch(`/review/details?id=${id}`);
		if (res.ok) details[id] = await res.json();
		else delete details[id];
	}

	$effect(() => {
		loadDetails(video?.id);
		loadDetails(next?.id);
		loadDetails(prev?.id);
	});

	function go(step: number) {
		const target = at + step;
		if (target < 0 || target >= count) return;
		index = target;
		feedback = '';
	}

	function onKey(event: KeyboardEvent) {
		const target = event.target as HTMLElement;
		if (target.closest('textarea, input')) return;
		if (event.key === 'ArrowLeft') go(-1);
		if (event.key === 'ArrowRight') go(1);
	}

	function confirmReject(event: SubmitEvent) {
		if ((event.submitter as HTMLButtonElement | null)?.value !== 'reject') return;
		const ok = confirm(`Reject this video? ${impactText[video.rejection.impact](video.rejection)}`);
		if (!ok) event.preventDefault();
	}

	const submitEnhance = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			feedback = '';
			busy = false;
		};
	};
</script>

<svelte:window onkeydown={onKey} />

<svelte:head>
	<title>Review · Day One Of</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="day-one">
	<main>
		<header class="top">
			<h1>Review</h1>
			<p>
				{#if count}<strong>{at + 1}</strong> of {count} to review · ← → to move ·{/if}
				<a href={data.showReviewed ? '/review' : '/review?show=reviewed'}>
					{data.showReviewed ? 'Hide reviewed' : 'Recently reviewed'}
				</a>
			</p>
		</header>
		{#if form?.error}<p class="error">{form.error}</p>{/if}

		{#if video}
			<div class="carousel">
				<button class="arrow" type="button" onclick={() => go(-1)} disabled={!prev} aria-label="Previous video"
					>‹</button
				>

				<button class="peek" type="button" onclick={() => go(-1)} disabled={!prev} aria-label="Previous video">
					{#if prev?.thumbnail}<img src={prev.thumbnail} alt="" />{/if}
					{#if prev}<span>{prev.name}</span>{/if}
				</button>

				{#key video.id}
					<div class="stage">
						{#if useArchive}
							<!-- svelte-ignore a11y_media_has_caption -->
							<video
								src={video.archiveUrl}
								poster={video.thumbnail || undefined}
								controls
								autoplay
								playsinline
								onerror={() => (archiveFailed[video.id] = true)}
							></video>
						{:else if video.embedUrl}
							<iframe
								src={video.embedUrl}
								title={video.title || 'Video'}
								allow="autoplay; encrypted-media; picture-in-picture"
								allowfullscreen
							></iframe>
						{/if}
						<span class="source">{useArchive ? 'archive' : video.platforms[0].platform}</span>
					</div>
				{/key}

				<button class="peek" type="button" onclick={() => go(1)} disabled={!next} aria-label="Next video">
					{#if next?.thumbnail}<img src={next.thumbnail} alt="" />{/if}
					{#if next}<span>{next.name}</span>{/if}
				</button>

				<button class="arrow" type="button" onclick={() => go(1)} disabled={!next} aria-label="Next video"
					>›</button
				>
			</div>

			<section class="panel">
				<div class="who">
					<h2><a href="/user/{video.slackId}">{video.name}</a></h2>
					<p>
						Day {video.day}{video.streakAtPost ? ` · ${video.streakAtPost}-day streak` : ''} · posted
						{formatDate(video.postedAt)} · {formatViews(video.views)} views
					</p>
					<p class="links">
						{#each video.platforms as p}
							<a href={p.url} target="_blank" rel="noopener">{p.platform} ({formatViews(p.views)})</a>
						{/each}
						<a href={video.slackUrl} target="_blank" rel="noopener">Slack thread</a>
					</p>
				</div>

				{#if video.flags.length}
					<ul class="flags">
						{#each video.flags as flag}<li>⚠ {flag}</li>{/each}
					</ul>
				{:else}
					<p class="ok">✓ No flags</p>
				{/if}

				<div class="text">
					<div>
						<h3>Their note</h3>
						{#if details[video.id]}
							<p class="quote">{details[video.id]?.note || 'No message.'}</p>
						{:else}
							<p class="muted">Loading…</p>
						{/if}
					</div>
					<div>
						<h3>Caption</h3>
						{#if details[video.id]}
							<p class="quote">{details[video.id]?.caption || video.title || 'No caption yet.'}</p>
						{:else}
							<p class="muted">Loading…</p>
						{/if}
					</div>
				</div>

				<form method="POST" action="?/review" onsubmit={confirmReject} use:enhance={submitEnhance}>
					<input type="hidden" name="id" value={video.id} />
					<label for="feedback"><h3>Feedback</h3></label>
					<textarea
						id="feedback"
						name="feedback"
						rows="4"
						bind:value={feedback}
						placeholder="Optional for star and pass. Posted as the bot in their thread. Required to reject, and sent as the reason."
					></textarea>

					<div class="decide">
						<button type="submit" name="decision" value="reject" class="reject" disabled={busy || !feedback.trim()}
							>Reject</button
						>
						<button type="submit" name="decision" value="feedback" class="quiet" disabled={busy || !feedback.trim()}
							>Just send feedback</button
						>
						<span class="spacer"></span>
						<button type="submit" name="decision" value="pass" disabled={busy}>Pass</button>
						<button type="submit" name="decision" value="star" class="star" disabled={busy}>⭐ Star</button>
					</div>
					<p class="impact">
						<strong>If rejected:</strong>
						{impactText[video.rejection.impact](video.rejection)}
					</p>
				</form>
			</section>
		{:else}
			<section class="panel"><p>The queue's empty. Everything's been reviewed!</p></section>
		{/if}

		{#if data.showReviewed}
			<section class="panel">
				<h2>Recently reviewed</h2>
				<table>
					<thead>
						<tr><th>Who</th><th>Video</th><th>Result</th><th>By</th><th>When</th><th>Feedback</th></tr>
					</thead>
					<tbody>
						{#each data.reviewed as r}
							<tr>
								<td><a href="/user/{r.slackId}">{r.name || r.slackId}</a></td>
								<td><a href={r.url} target="_blank" rel="noopener">{r.url}</a></td>
								<td>{r.status}</td>
								<td>{r.by}</td>
								<td>{formatDate(r.at)}</td>
								<td>{r.feedback}</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</section>
		{/if}
	</main>
</div>

<style>
	main {
		max-width: 1120px;
		margin-inline: auto;
		padding: 28px 20px 60px;
	}

	h1,
	h2,
	h3 {
		font-family: var(--font-hand);
		font-weight: 700;
	}

	h1 {
		font-size: 2.2rem;
		margin: 0;
	}

	h2 {
		font-size: 1.5rem;
		margin: 0;
	}

	h3 {
		font-size: 1.1rem;
		margin: 0 0 4px;
	}

	p,
	li {
		line-height: 1.5;
		color: var(--ink-soft);
	}

	a {
		color: var(--accent);
		font-weight: 600;
	}

	.top {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		justify-content: space-between;
		gap: 8px;
	}

	.carousel {
		display: grid;
		grid-template-columns: auto 1fr minmax(240px, 340px) 1fr auto;
		align-items: center;
		gap: 16px;
		margin-top: 20px;
	}

	.stage {
		position: relative;
	}

	.stage video,
	.stage iframe {
		display: block;
		width: 100%;
		aspect-ratio: 9 / 16;
		border: 0;
		border-radius: 15px 8px 12px 9px/9px 13px 8px 15px;
		background: var(--ink);
		box-shadow: 6px 7px 0 var(--shadow);
	}

	.source {
		position: absolute;
		top: 8px;
		left: 8px;
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--bg);
		background: rgb(0 0 0 / 0.55);
		border-radius: 999px;
		padding: 2px 10px;
		pointer-events: none;
	}

	.peek {
		all: unset;
		position: relative;
		justify-self: center;
		width: min(100%, 180px);
		aspect-ratio: 9 / 16;
		border-radius: 12px;
		overflow: hidden;
		background: var(--bg-2);
		opacity: 0.45;
		filter: grayscale(0.4);
		transform: scale(0.92);
		cursor: var(--cursor-pointer);
		transition:
			opacity 0.15s ease,
			transform 0.15s ease;
	}

	.peek:hover:not(:disabled) {
		opacity: 0.8;
		transform: scale(0.96);
	}

	.peek:disabled {
		visibility: hidden;
	}

	.peek img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.peek span {
		position: absolute;
		inset: auto 0 0;
		padding: 6px 8px;
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--bg);
		background: linear-gradient(transparent, rgb(0 0 0 / 0.7));
	}

	.arrow {
		all: unset;
		font-size: 2.6rem;
		font-weight: 700;
		line-height: 1;
		width: 48px;
		height: 48px;
		display: grid;
		place-items: center;
		border-radius: 50%;
		color: var(--bg);
		background: var(--ink);
		box-shadow: 3px 4px 0 var(--shadow);
		cursor: var(--cursor-pointer);
	}

	.arrow:disabled {
		opacity: 0.2;
		cursor: default;
	}

	@media (max-width: 760px) {
		.carousel {
			grid-template-columns: auto 1fr auto;
		}

		.peek {
			display: none;
		}
	}

	.panel {
		background: var(--paper), var(--pencil);
		border: 3px solid transparent;
		border-radius: 12px 6px 10px 6px/6px 12px 6px 10px;
		box-shadow: 4px 5px 0 var(--shadow);
		padding: 20px 24px;
		margin-top: 28px;
		overflow-x: auto;
	}

	.who p {
		margin: 2px 0;
	}

	.links {
		display: flex;
		flex-wrap: wrap;
		gap: 4px 14px;
	}

	.flags {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		padding: 0;
		margin: 14px 0;
		list-style: none;
	}

	.flags li {
		font-size: 0.85rem;
		font-weight: 700;
		color: #6b4b00;
		background: #ffe9a8;
		border-radius: 999px;
		padding: 3px 12px;
	}

	.ok {
		font-weight: 700;
		color: #2e7d32;
		margin: 14px 0;
	}

	.text {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 20px;
		margin-bottom: 16px;
	}

	@media (max-width: 760px) {
		.text {
			grid-template-columns: 1fr;
		}
	}

	.quote {
		white-space: pre-wrap;
		margin: 0;
		padding: 8px 12px;
		border-left: 3px solid var(--line);
		max-height: 12em;
		overflow-y: auto;
	}

	.muted {
		font-style: italic;
		margin: 0;
	}

	textarea {
		font: inherit;
		width: 100%;
		box-sizing: border-box;
		padding: 10px 12px;
		border: 3px solid transparent;
		border-radius: 10px;
		background: var(--paper), var(--pencil);
		color: var(--ink);
		resize: vertical;
	}

	textarea:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 1px;
	}

	.decide {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 8px;
		margin-top: 10px;
	}

	.spacer {
		flex: 1;
	}

	.decide button {
		font: inherit;
		font-weight: 700;
		font-size: 1rem;
		color: var(--bg);
		background: var(--ink);
		border: 2px solid var(--ink);
		border-radius: 12px 6px 10px 6px/6px 12px 6px 10px;
		padding: 7px 18px 13px;
		cursor: var(--cursor-pointer);
		box-shadow: inset 0 -5px 0 var(--accent);
	}

	.decide button:disabled {
		opacity: 0.4;
		cursor: default;
	}

	.decide .star {
		color: var(--ink);
		background: #f5c518;
		border-color: #c99a00;
		box-shadow: inset 0 -5px 0 #c99a00;
	}

	.decide .reject {
		background: #c0392b;
		border-color: #922b21;
		box-shadow: inset 0 -5px 0 #922b21;
	}

	.decide .quiet {
		color: var(--ink);
		background: transparent;
		box-shadow: none;
	}

	.impact {
		font-size: 0.9rem;
		margin-bottom: 0;
	}

	.error {
		color: #c0392b;
		font-weight: 700;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.9rem;
	}

	th {
		text-align: left;
		font-family: var(--font-hand);
		padding: 8px;
		border-bottom: 2px solid var(--ink);
	}

	td {
		padding: 6px 8px;
		border-top: 1px dashed var(--line);
		vertical-align: top;
	}
</style>
