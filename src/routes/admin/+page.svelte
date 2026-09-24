<script lang="ts">
	let { data, form } = $props();

	function confirmNuke(event: SubmitEvent) {
		const ok = confirm(
			'This permanently deletes every row in every dev Airtable table (participants, days, submissions). There is no undo. Are you sure?'
		);
		if (!ok) event.preventDefault();
	}
</script>

<svelte:head>
	<title>Admin · Day One Of</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="day-one">
	<main>
		<h1>Admin</h1>
		<p>
			Participant fields (streak, freezes, status, etc.) are correctable directly in Airtable, so
			this page doesn't duplicate that. Everything for debugging lives here now, not in Slack.
		</p>
		<p>{data.videosPosted} videos posted · {data.videosTracked} tracked by unified-socials</p>

		<section>
			<h2>Jobs</h2>
			<ul>
				<li>
					<strong>reconcile</strong>: for anyone active/frozen whose day ended (3am their time)
					without a post, spends a freeze (or breaks their streak if they have none left). Runs
					hourly.
				</li>
				<li>
					<strong>leaderboard</strong>: refreshes view counts from unified-socials for every
					submission (editing each submission's original reply in place with the fresh numbers),
					then posts the streak, views, and top-videos boards to the announce channel. The cron
					only posts at 9pm Eastern once submissions open; the button below always posts.
				</li>
				<li>
					<strong>remind</strong>: once submissions open, the hourly cron DMs anyone with a streak
					of 1+ who hasn't posted today and hasn't turned reminders off, at 8pm their time. The
					button below is a pure test blast. It DMs <em>everyone</em>, ignoring the hour, whether they've posted
					today, and whether they were already reminded, and it doesn't mark anyone as reminded,
					so it can't suppress a real reminder later today.
				</li>
			</ul>

			<form class="inline" method="POST" action="?/runReconcile">
				<button type="submit">Run reconcile</button>
			</form>
			<form class="inline" method="POST" action="?/runLeaderboard">
				<button type="submit">Run leaderboard</button>
			</form>
			<form class="inline" method="POST" action="?/runRemind">
				<button type="submit">Run remind</button>
			</form>

			{#if form?.error}
				<p><strong>{form.ranJob} failed:</strong> {form.error}</p>
			{:else if form?.ranJob}
				<pre>{form.ranJob}: {JSON.stringify(form.result)}</pre>
			{/if}
			{#if form?.verified}
				<p>Force-verified participant {form.verified}.</p>
			{/if}
		</section>

		<section>
			<h2>Check unified-socials stats</h2>
			<p>Paste a submitted video's URL to see its live view/like count right now.</p>
			<form method="POST" action="?/checkStats">
				<input type="text" name="url" placeholder="https://..." size="40" />
				<button type="submit">Check stats</button>
			</form>
			{#if form?.statsError}
				<p><strong>Failed:</strong> {form.statsError}</p>
			{:else if form?.statsChecked}
				<p>
					{form.statsChecked}:
					{#if form.stats}
						{form.stats.views} views · {form.stats.likes} likes
					{:else}
						no unified-socials match yet
					{/if}
				</p>
			{/if}
		</section>

		<section>
			<h2>Participants</h2>
			<table>
				<thead>
					<tr>
						<th>Name</th>
						<th>Slack</th>
						<th>Status</th>
						<th>HCA verification</th>
						<th>Streak</th>
						<th>Freezes</th>
						<th>Days</th>
						<th>Videos</th>
						<th>Views</th>
						<th></th>
					</tr>
				</thead>
				<tbody>
					{#each data.participants as p}
						<tr>
							<td><a href="/user/{p.slackId}">{p.name}</a></td>
							<td>{p.slackId}</td>
							<td>{p.status}</td>
							<td>{p.verificationStatus || 'none'}</td>
							<td>{p.currentStreak}</td>
							<td>{p.streakFreezes}</td>
							<td>{p.daysCompleted}</td>
							<td>{p.videosPosted}</td>
							<td>{p.totalViews}</td>
							<td>
								{#if !p.verified}
									<form class="inline" method="POST" action="?/forceVerify">
										<input type="hidden" name="id" value={p.id} />
										<button type="submit">Force verify</button>
									</form>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</section>

		{#if data.canNuke}
			<section>
				<h2>Danger zone</h2>
				<p>Deletes every row in every Airtable table. Dev only, and there is no undo.</p>
				{#if form?.nuked}
					<p>Deleted {form.deleted} rows.</p>
				{/if}
				<form method="POST" action="?/nukeAllData" onsubmit={confirmNuke}>
					<button type="submit">⚠️ Nuke all data</button>
				</form>
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
	h2 {
		font-family: var(--font-hand);
		font-weight: 700;
	}

	h1 {
		font-size: 2.2rem;
		margin: 0 0 16px;
	}

	h2 {
		font-size: 1.4rem;
		margin: 0 0 14px;
	}

	p,
	li {
		line-height: 1.5;
		color: var(--ink-soft);
	}

	strong {
		color: var(--ink);
	}

	a {
		color: var(--accent);
		font-weight: 600;
	}

	section {
		background: var(--bg-2);
		border: 2px solid var(--ink);
		border-radius: 12px 6px 10px 6px/6px 12px 6px 10px;
		box-shadow: 4px 5px 0 var(--shadow);
		padding: 20px 24px;
		margin-top: 28px;
		overflow-x: auto;
	}

	.inline {
		display: inline;
	}

	button {
		font: inherit;
		font-weight: 700;
		font-size: 0.9rem;
		color: var(--bg);
		background: var(--ink);
		border: 2px solid var(--ink);
		border-radius: 12px 6px 10px 6px/6px 12px 6px 10px;
		padding: 5px 14px 11px;
		margin: 4px 6px 4px 0;
		cursor: var(--cursor-pointer);
		box-shadow: inset 0 -5px 0 var(--accent);
		transform: rotate(-1deg);
		transition:
			transform 0.15s ease,
			padding 0.15s ease,
			box-shadow 0.15s ease,
			filter 0.15s ease;
	}

	button:hover {
		filter: brightness(1.08);
	}

	button:active {
		padding: 8px 14px;
		box-shadow: none;
		transform: none;
	}

	input[type='text'] {
		font: inherit;
		padding: 8px 12px;
		border: 2px solid var(--ink);
		border-radius: 10px;
		background: var(--bg-2);
		color: var(--ink);
		max-width: 100%;
	}

	input[type='text']:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 1px;
	}

	pre {
		background: var(--bg);
		border: 1px dashed var(--line);
		border-radius: 8px;
		padding: 10px 12px;
		white-space: pre-wrap;
		word-break: break-all;
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
		font-variant-numeric: tabular-nums;
	}

	td button {
		margin: 0;
		padding: 2px 10px 8px;
		font-size: 0.8rem;
	}

	td button:active {
		padding: 5px 10px;
	}
</style>
