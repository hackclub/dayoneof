<script lang="ts">
	let { data, form } = $props();
</script>

<svelte:head>
	<title>Admin · Day One Of</title>
</svelte:head>

<main>
	<h1>Admin</h1>

	<section>
		<h2>Jobs</h2>
		<form method="POST" action="?/runReconcile" style="display:inline">
			<button type="submit">Run reconcile</button>
		</form>
		<form method="POST" action="?/runLeaderboard" style="display:inline">
			<button type="submit">Run leaderboard</button>
		</form>
		<form method="POST" action="?/runRemind" style="display:inline">
			<button type="submit">Run remind</button>
		</form>

		{#if form?.ranJob}
			<pre>{form.ranJob}: {JSON.stringify(form.result)}</pre>
		{/if}
		{#if form?.adjusted}
			<p>Updated participant {form.adjusted}.</p>
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
					<th>Correct</th>
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
							<form method="POST" action="?/adjustParticipant" style="display:inline">
								<input type="hidden" name="id" value={p.id} />
								<input type="number" name="currentStreak" value={p.currentStreak} size="2" title="current streak" />
								<input type="number" name="streakFreezes" value={p.streakFreezes} size="2" title="streak freezes" />
								<select name="status">
									<option value="notStarted" selected={p.status === 'notStarted'}>notStarted</option>
									<option value="active" selected={p.status === 'active'}>active</option>
									<option value="frozen" selected={p.status === 'frozen'}>frozen</option>
									<option value="broken" selected={p.status === 'broken'}>broken</option>
								</select>
								<button type="submit">Save</button>
							</form>
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
