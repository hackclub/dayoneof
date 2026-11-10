<script lang="ts">
	import ViewsChart from '$lib/views_chart.svelte';
	import { formatViews } from '$lib/format';

	type Day = { date: string; stats: Record<string, number> };
	let { history }: { history: Day[] } = $props();

	// Modelled on Stripe and PostHog: pick a period, every number is that period against the one
	// before it, and every number has a chart. "flow" metrics happen per day and are added up (or
	// averaged) over the period; "stock" metrics are a level, read at the end of each period.
	type Format = 'compact' | 'int' | 'dec' | 'pct';
	type Metric = {
		id: string;
		label: string;
		hint: string;
		kind: 'flow' | 'stock';
		agg?: 'sum' | 'avg';
		good: 'up' | 'down' | 'none';
		format: Format;
		perDay: (i: number) => number | null;
	};

	const PERIODS = [7, 14, 30];
	let period = $state(7);

	const today = $derived(history[history.length - 1].date);
	const addDays = (date: string, n: number) => {
		const d = new Date(`${date}T00:00:00Z`);
		d.setUTCDate(d.getUTCDate() + n);
		return d.toISOString().slice(0, 10);
	};
	const indexOf = $derived(new Map(history.map((d, i) => [d.date, i])));

	const level = (key: string) => (i: number) => history[i]?.stats[key] ?? null;
	// What a running total added that day; unknown when the day before wasn't saved.
	const gained = (key: string) => (i: number) => {
		const before = history[i - 1];
		const day = history[i];
		if (!before || !day || addDays(before.date, 1) !== day.date) return null;
		const a = day.stats[key];
		const b = before.stats[key];
		return a == null || b == null ? null : a - b;
	};
	const ratio = (top: (i: number) => number | null, bottom: (i: number) => number | null, scale = 1) => (i: number) => {
		const t = top(i);
		const b = bottom(i);
		return t == null || !b ? null : Math.round((t / b) * scale * 10) / 10;
	};
	const sumOf = (...parts: ((i: number) => number | null)[]) => (i: number) => {
		const values = parts.map((p) => p(i));
		return values.some((v) => v == null) ? null : values.reduce((a, b) => a! + b!, 0);
	};

	const outcomes = sumOf(level('postedToday'), level('frozenToday'), level('missedToday'));

	const HEADLINE: Metric[] = [
		{ id: 'viewsGained', label: 'Views gained', hint: 'New views across every video', kind: 'flow', agg: 'sum', good: 'up', format: 'compact', perDay: gained('views') },
		{ id: 'posters', label: 'Daily posters', hint: 'People who posted, average per day', kind: 'flow', agg: 'avg', good: 'up', format: 'dec', perDay: level('postedToday') },
		{ id: 'signups', label: 'New signups', hint: 'People who signed up', kind: 'flow', agg: 'sum', good: 'up', format: 'int', perDay: gained('signups') },
		{ id: 'live', label: 'Live streaks', hint: 'People with a streak right now', kind: 'stock', good: 'up', format: 'int', perDay: level('live') }
	];

	const TRENDS: Metric[] = [
		{ id: 'videosNew', label: 'New videos', hint: 'Videos posted', kind: 'flow', agg: 'sum', good: 'up', format: 'int', perDay: gained('videos') },
		{ id: 'postRate', label: 'Post rate', hint: 'Of people whose streak was on the line, % who posted', kind: 'flow', agg: 'avg', good: 'up', format: 'pct', perDay: ratio(level('postedToday'), outcomes, 100) },
		{ id: 'missed', label: 'Streaks broken', hint: 'People who missed a day with no freeze left', kind: 'flow', agg: 'sum', good: 'down', format: 'int', perDay: level('missedToday') },
		{ id: 'frozen', label: 'Freezes used', hint: 'Missed days a freeze covered', kind: 'flow', agg: 'sum', good: 'down', format: 'int', perDay: level('frozenToday') },
		{ id: 'starters', label: 'First-time posters', hint: 'People who posted for the first time', kind: 'flow', agg: 'sum', good: 'up', format: 'int', perDay: gained('started') },
		{ id: 'viewsPerVideo', label: 'Views per video', hint: 'Average across every live video', kind: 'stock', good: 'up', format: 'dec', perDay: ratio(level('views'), level('videos')) },
		{ id: 'views', label: 'Total views', hint: 'Every live video, every platform', kind: 'stock', good: 'up', format: 'compact', perDay: level('views') },
		{ id: 'avgStreak', label: 'Avg live streak', hint: 'Days, across people with a streak', kind: 'stock', good: 'up', format: 'dec', perDay: level('averageStreak') },
		{ id: 'longest', label: 'Longest streak', hint: 'Days', kind: 'stock', good: 'up', format: 'int', perDay: level('longestStreak') },
		{ id: 'youtube', label: 'YouTube views gained', hint: 'New YouTube views', kind: 'flow', agg: 'sum', good: 'up', format: 'compact', perDay: gained('youtubeViews') },
		{ id: 'tiktok', label: 'TikTok views gained', hint: 'New TikTok views', kind: 'flow', agg: 'sum', good: 'up', format: 'compact', perDay: gained('tiktokViews') },
		{ id: 'instagram', label: 'Instagram views gained', hint: 'New Instagram views', kind: 'flow', agg: 'sum', good: 'up', format: 'compact', perDay: gained('instagramViews') },
		{ id: 'likes', label: 'Likes gained', hint: 'New likes across every video', kind: 'flow', agg: 'sum', good: 'up', format: 'compact', perDay: gained('likes') },
		{ id: 'unreviewed', label: 'Review backlog', hint: 'Videos waiting for a reviewer', kind: 'stock', good: 'down', format: 'int', perDay: level('unreviewed') },
		{ id: 'nps', label: 'NPS', hint: 'From the feedback form, −100 to 100', kind: 'stock', good: 'up', format: 'dec', perDay: level('nps') }
	];

	const TABLE: { key: string; label: string; good: 'up' | 'down' | 'none'; format: Format }[] = [
		{ key: 'signups', label: 'Signups', good: 'up', format: 'int' },
		{ key: 'verified', label: 'Verified', good: 'up', format: 'int' },
		{ key: 'started', label: 'Ever posted', good: 'up', format: 'int' },
		{ key: 'active', label: 'Active', good: 'up', format: 'int' },
		{ key: 'frozen', label: 'On a freeze', good: 'down', format: 'int' },
		{ key: 'broken', label: 'Broken streaks', good: 'down', format: 'int' },
		{ key: 'notStarted', label: 'Never posted', good: 'down', format: 'int' },
		{ key: 'daysCompleted', label: 'Days posted (everyone)', good: 'up', format: 'int' },
		{ key: 'freezesBanked', label: 'Freezes banked', good: 'none', format: 'int' },
		{ key: 'videos', label: 'Videos', good: 'up', format: 'int' },
		{ key: 'links', label: 'Links', good: 'up', format: 'int' },
		{ key: 'likes', label: 'Likes', good: 'up', format: 'compact' },
		{ key: 'starred', label: 'Starred', good: 'up', format: 'int' },
		{ key: 'passed', label: 'Passed', good: 'none', format: 'int' },
		{ key: 'rejected', label: 'Rejected', good: 'down', format: 'int' },
		{ key: 'escalated', label: 'Waiting on an admin', good: 'down', format: 'int' },
		{ key: 'warnings', label: 'Warnings given', good: 'down', format: 'int' },
		{ key: 'pending', label: 'Waiting on data', good: 'down', format: 'int' },
		{ key: 'deletedVideos', label: 'Deleted videos', good: 'down', format: 'int' },
		{ key: 'unavailable', label: 'Removed or private', good: 'down', format: 'int' },
		{ key: 'noHcMention', label: 'No Hack Club mention', good: 'down', format: 'int' },
		{ key: 'repeats', label: 'Possible repeats', good: 'down', format: 'int' },
		{ key: 'remindersOff', label: 'Reminders off', good: 'down', format: 'int' },
		{ key: 'shippingForms', label: 'Shipping forms', good: 'none', format: 'int' },
		{ key: 'feedbackResponses', label: 'Feedback responses', good: 'up', format: 'int' }
	];

	// The last `days` days. Flows use whole days, ending yesterday, so a half-finished today
	// doesn't look like a drop; stocks end today.
	const daysOf = (m: Metric, days: number, back = 0) => {
		const end = m.kind === 'flow' ? addDays(today, -1 - back) : addDays(today, -back);
		return Array.from({ length: days }, (_, k) => addDays(end, k - days + 1));
	};
	const valueOn = (m: Metric, date: string) => {
		const i = indexOf.get(date);
		return i == null ? null : m.perDay(i);
	};
	function total(m: Metric, back: number) {
		if (m.kind === 'stock') return valueOn(m, addDays(today, -back));
		const values = daysOf(m, period, back)
			.map((d) => valueOn(m, d))
			.filter((v): v is number => v != null);
		if (!values.length) return null;
		const sum = values.reduce((a, b) => a + b, 0);
		return m.agg === 'avg' ? Math.round((sum / values.length) * 10) / 10 : sum;
	}
	const summary = (m: Metric) => {
		const current = total(m, 0);
		const previous = total(m, period);
		const change = current == null || previous == null ? null : current - previous;
		const percent = change == null || !previous ? null : (change / Math.abs(previous)) * 100;
		return { current, previous, change, percent };
	};
	const points = (m: Metric) =>
		daysOf(m, period)
			.map((date) => ({ date, value: valueOn(m, date) }))
			.filter((p): p is { date: string; value: number } => p.value != null);
	const before = (m: Metric) =>
		daysOf(m, period)
			.filter((date) => valueOn(m, date) != null)
			.map((date) => valueOn(m, addDays(date, -period)));
	const todaySoFar = (m: Metric) => {
		const i = indexOf.get(today);
		return m.kind === 'flow' && i != null ? m.perDay(i) : null;
	};

	const fmt = (format: Format, n: number | null) =>
		n == null
			? '—'
			: format === 'compact'
				? formatViews(n)
				: format === 'pct'
					? `${n.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`
					: n.toLocaleString(undefined, { maximumFractionDigits: format === 'dec' ? 1 : 0 });
	const signed = (format: Format, n: number) =>
		`${n > 0 ? '+' : n < 0 ? '−' : '±'}${fmt(format === 'pct' ? 'dec' : format, Math.abs(n))}${format === 'pct' ? ' pts' : ''}`;
	const tone = (good: Metric['good'], n: number | null) =>
		!n || good === 'none' ? 'flat' : (n > 0) === (good === 'up') ? 'good' : 'bad';
	const arrow = (n: number | null) => (!n ? '→' : n > 0 ? '▲' : '▼');
	const percentText = (p: number | null) =>
		p == null ? '' : `${Math.abs(p) >= 100 ? Math.round(Math.abs(p)) : Math.abs(p).toFixed(1)}%`;

	const funnel = $derived.by(() => {
		const s = history[history.length - 1].stats;
		const steps = [
			{ label: 'Signed up', value: s.signups ?? 0 },
			{ label: 'Verified', value: s.verified ?? 0 },
			{ label: 'Posted once', value: s.started ?? 0 },
			{ label: 'Live streak', value: s.live ?? 0 }
		];
		return steps.map((step, i) => ({
			...step,
			width: steps[0].value ? (step.value / steps[0].value) * 100 : 0,
			fromLast: i && steps[i - 1].value ? Math.round((step.value / steps[i - 1].value) * 100) : null
		}));
	});
</script>

{#snippet badge(m: { good: Metric['good']; format: Format }, s: ReturnType<typeof summary>)}
	{#if s.change == null}
		<span class="badge flat">no earlier data</span>
	{:else}
		<span class="badge {tone(m.good, s.change)}">
			{arrow(s.change)}
			{s.percent != null && m.format !== 'pct' ? percentText(s.percent) : signed(m.format, s.change)}
		</span>
	{/if}
{/snippet}

<div class="head">
	<h2>Overview</h2>
	<div class="periods" role="group" aria-label="Period">
		{#each PERIODS as days}
			<button type="button" class:active={period === days} aria-pressed={period === days} onclick={() => (period = days)}
				>{days} days</button
			>
		{/each}
	</div>
</div>
<p class="legend">
	Every number is the last {period} days against the {period} days before. Per-day numbers stop at
	yesterday so today's half-finished day doesn't look like a drop. Dashed lines are the {period} days
	before. Green is good news, red is bad.
</p>

<div class="headline">
	{#each HEADLINE as m}
		{@const s = summary(m)}
		<article class="card big">
			<span class="label">{m.label}</span>
			<div class="value-row">
				<span class="value">{fmt(m.format, s.current)}</span>
				{@render badge(m, s)}
			</div>
			<span class="hint">
				{m.hint} · before: {fmt(m.format, s.previous)}
				{#if todaySoFar(m) != null}· today so far: {fmt(m.format, todaySoFar(m))}{/if}
			</span>
			{#if points(m).length > 1}
				<ViewsChart kind="line" height={70} points={points(m)} compare={before(m)} label={m.label} unit="" />
			{/if}
		</article>
	{/each}
</div>

<div class="split">
	<article class="card">
		<span class="label">Funnel, all time</span>
		<span class="hint">How far people get. The % is how many made it from the step before.</span>
		<ol class="funnel">
			{#each funnel as step}
				<li>
					<span class="step-label">{step.label}</span>
					<span class="step-bar"><span style="width: {step.width}%"></span></span>
					<span class="step-value">{step.value.toLocaleString()}</span>
					<span class="step-rate">{step.fromLast == null ? '' : `${step.fromLast}%`}</span>
				</li>
			{/each}
		</ol>
	</article>
	<article class="card">
		<span class="label">Every number, last {period} days</span>
		<div class="table-wrap">
			<table>
				<thead>
					<tr><th>Number</th><th>Now</th><th>Change</th></tr>
				</thead>
				<tbody>
					{#each TABLE as row}
						{@const m = { id: row.key, label: row.label, hint: '', kind: 'stock' as const, good: row.good, format: row.format, perDay: level(row.key) }}
						{@const s = summary(m)}
						<tr>
							<td>{row.label}</td>
							<td><strong>{fmt(row.format, s.current)}</strong></td>
							<td>
								{#if s.change == null}
									<span class="move flat">—</span>
								{:else}
									<span class="move {tone(row.good, s.change)}"
										>{arrow(s.change)} {signed(row.format, s.change)}{s.percent != null ? ` (${percentText(s.percent)})` : ''}</span
									>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
		</div>
	</article>
</div>

<h3>Trends</h3>
<div class="trends">
	{#each TRENDS as m}
		{@const s = summary(m)}
		<article class="card">
			<span class="label">{m.label}</span>
			<div class="value-row">
				<span class="value small">{fmt(m.format, s.current)}</span>
				{@render badge(m, s)}
			</div>
			<span class="hint">
				{m.hint}{m.kind === 'flow' && m.agg === 'avg' ? ', per day' : ''} · before: {fmt(m.format, s.previous)}
			</span>
			{#if points(m).length > 1}
				<ViewsChart
					kind={m.kind === 'flow' && m.agg === 'sum' ? 'bars' : 'line'}
					height={90}
					points={points(m)}
					compare={before(m)}
					label={m.label}
					unit=""
				/>
			{:else}
				<p class="hint">Not enough saved days yet.</p>
			{/if}
		</article>
	{/each}
</div>

<style>
	.head {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}

	h2 {
		font-family: var(--font-hand);
		font-size: 1.4rem;
		margin: 0;
	}

	h3 {
		font-family: var(--font-hand);
		margin: 22px 0 10px;
	}

	.periods {
		display: flex;
		gap: 3px;
		padding: 3px;
		border: 2px solid var(--line);
		border-radius: 10px;
		background: var(--bg-2);
	}

	.periods button {
		all: unset;
		font-weight: 700;
		font-size: 0.85rem;
		padding: 4px 12px;
		border-radius: 7px;
		color: var(--ink-soft);
		cursor: var(--cursor-pointer);
	}

	.periods button.active {
		color: var(--accent-ink);
		background: var(--accent);
	}

	.legend {
		font-size: 0.85rem;
		margin: 8px 0 16px;
	}

	.headline {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
		gap: 14px;
	}

	.trends {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
		gap: 14px;
	}

	.split {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.3fr);
		gap: 14px;
		margin-top: 14px;
	}

	@media (max-width: 800px) {
		.split {
			grid-template-columns: minmax(0, 1fr);
		}
	}

	.card {
		display: flex;
		flex-direction: column;
		gap: 4px;
		min-width: 0;
		padding: 12px 14px;
		border: 2px solid var(--line);
		border-radius: 12px 6px 10px 6px/6px 12px 6px 10px;
		background: var(--bg-2);
	}

	.card.big {
		border-color: var(--ink);
		box-shadow: 3px 4px 0 var(--shadow);
	}

	.label {
		font-family: var(--font-hand);
		font-weight: 700;
		color: var(--ink);
	}

	.value-row {
		display: flex;
		align-items: baseline;
		flex-wrap: wrap;
		gap: 8px;
	}

	.value {
		font-size: 2rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		line-height: 1.1;
		color: var(--ink);
	}

	.value.small {
		font-size: 1.5rem;
	}

	.hint {
		font-size: 0.78rem;
		color: var(--ink-soft);
		margin: 0;
	}

	.badge {
		font-size: 0.85rem;
		font-weight: 800;
		font-variant-numeric: tabular-nums;
		padding: 1px 7px;
		border-radius: 6px;
	}

	.badge.good {
		color: #1f6b25;
		background: #d8efd5;
	}

	.badge.bad {
		color: #922b21;
		background: #f9d6d2;
	}

	.badge.flat {
		color: var(--ink-soft);
		background: var(--bg);
	}

	.funnel {
		list-style: none;
		padding: 0;
		margin: 10px 0 0;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.funnel li {
		display: grid;
		grid-template-columns: 7rem 1fr 3.5rem 2.8rem;
		align-items: center;
		gap: 8px;
		font-size: 0.9rem;
	}

	.step-label {
		font-weight: 700;
	}

	.step-bar {
		height: 14px;
		background: var(--bg);
		border-radius: 4px;
		overflow: hidden;
	}

	.step-bar span {
		display: block;
		height: 100%;
		background: var(--accent);
	}

	.step-value {
		font-weight: 800;
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.step-rate {
		color: var(--ink-soft);
		text-align: right;
		font-variant-numeric: tabular-nums;
	}

	.table-wrap {
		max-height: 22rem;
		overflow-y: auto;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		font-size: 0.85rem;
	}

	th {
		position: sticky;
		top: 0;
		text-align: left;
		font-family: var(--font-hand);
		padding: 6px;
		background: var(--bg-2);
		border-bottom: 2px solid var(--ink);
	}

	td {
		padding: 4px 6px;
		border-top: 1px dashed var(--line);
		font-variant-numeric: tabular-nums;
	}

	.move {
		font-weight: 700;
	}

	.move.good {
		color: #2e7d32;
	}

	.move.bad {
		color: var(--accent);
	}

	.move.flat {
		color: var(--ink-soft);
	}
</style>
