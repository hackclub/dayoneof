<script lang="ts">
	let { data, form } = $props();

	function confirmNuke(event: SubmitEvent) {
		const ok = confirm(
			'This permanently deletes every row in every dev Airtable table (participants, days, submissions, reviews). There is no undo. Are you sure?'
		);
		if (!ok) event.preventDefault();
	}
</script>

<svelte:head>
	<title>Admin · Day One Of</title>
</svelte:head>

<main>
	<h1>Admin</h1>
	<p>
		Participant fields (streak, freezes, status, etc.) are correctable directly in Airtable —
		this page doesn't duplicate that. Everything for debugging lives here now, not in Slack.
	</p>
	<p>{data.videosPosted} videos posted · {data.videosTracked} tracked by unified-socials</p>

	<section>
		<h2>Jobs</h2>
		<ul>
			<li>
				<strong>reconcile</strong> — for anyone active/frozen who didn't post yesterday: spends
				a freeze (or breaks their streak if they have none left), then refreshes view counts
				from unified-socials for every submission (and edits each submission's original reply
				in place with the fresh numbers). Runs nightly at 00:05 UTC.
			</li>
			<li>
				<strong>leaderboard</strong> — posts the streak, views, and top-videos boards to the
				announce channel. Runs nightly at 00:00 UTC.
			</li>
			<li>
				<strong>remind</strong> — the real hourly cron DMs anyone whose reminder hour matches
				right now (their local time) and who hasn't posted today. The button below is a pure
				test blast: DMs <em>everyone</em>, ignoring reminder hour, whether they've posted
				today, and whether they were already reminded — and doesn't mark anyone as reminded,
				so it can't suppress a real reminder later today.
			</li>
		</ul>

		<form method="POST" action="?/runReconcile" style="display:inline">
			<button type="submit">Run reconcile</button>
		</form>
		<form method="POST" action="?/runLeaderboard" style="display:inline">
			<button type="submit">Run leaderboard</button>
		</form>
		<form method="POST" action="?/runRemind" style="display:inline">
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
				{form.statsChecked} —
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
						<td>{p.verificationStatus || '—'}</td>
						<td>{p.currentStreak}</td>
						<td>{p.streakFreezes}</td>
						<td>{p.daysCompleted}</td>
						<td>{p.videosPosted}</td>
						<td>{p.totalViews}</td>
						<td>
							{#if !p.verified}
								<form method="POST" action="?/forceVerify" style="display:inline">
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
			<p>Deletes every row in every Airtable table. Dev only — no undo.</p>
			{#if form?.nuked}
				<p>Deleted {form.deleted} rows.</p>
			{/if}
			<form method="POST" action="?/nukeAllData" onsubmit={confirmNuke}>
				<button type="submit">⚠️ Nuke all data</button>
			</form>
		</section>
	{/if}
</main>
