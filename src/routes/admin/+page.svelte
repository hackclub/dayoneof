<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head>
	<title>Admin · Day One Of</title>
</svelte:head>

<main>
	<h1>Admin</h1>
	<p>
		Participant fields (streak, freezes, status, etc.) are correctable directly in Airtable —
		this page doesn't duplicate that. It's for the things Airtable can't do: running jobs on
		demand and force-verifying someone whose real HCA verification hasn't come through yet.
	</p>

	<section>
		<h2>Jobs</h2>
		<ul>
			<li>
				<strong>reconcile</strong> — for anyone active/frozen who didn't post yesterday: spends
				a freeze (or breaks their streak if they have none left), then refreshes view counts
				from unified-socials for every submission. Runs nightly at 00:05 UTC.
			</li>
			<li>
				<strong>leaderboard</strong> — posts the streak and views boards to the announce
				channel. Runs nightly at 00:00 UTC.
			</li>
			<li>
				<strong>remind</strong> — the real hourly cron DMs anyone whose reminder hour matches
				right now (their local time) and who hasn't posted today. The button below ignores
				reminder hour entirely and DMs everyone who hasn't posted today (for testing) — it
				still won't double-DM someone already reminded today or who already posted.
				<code>sent: 0</code> just means everyone eligible has already posted or been
				reminded, not necessarily a bug.
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
					<th>Views</th>
					<th></th>
				</tr>
			</thead>
			<tbody>
				{#each data.participants as p}
					<tr>
						<td>{p.name}</td>
						<td>{p.slackId}</td>
						<td>{p.status}</td>
						<td>{p.verificationStatus || '—'}</td>
						<td>{p.currentStreak}</td>
						<td>{p.streakFreezes}</td>
						<td>{p.daysCompleted}</td>
						<td>{p.totalViews}</td>
						<td>
							{#if !p.verificationStatus?.startsWith('verified')}
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
</main>
