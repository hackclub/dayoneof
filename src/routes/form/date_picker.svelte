<script lang="ts">
	let {
		id,
		name,
		value = $bindable(''),
		invalid = false
	}: { id: string; name: string; value?: string; invalid?: boolean } = $props();

	const MONTHS = [
		'January', 'February', 'March', 'April', 'May', 'June',
		'July', 'August', 'September', 'October', 'November', 'December'
	];
	const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
	const today = new Date();
	const thisYear = today.getFullYear();
	const YEARS = Array.from({ length: thisYear - 1900 + 1 }, (_, i) => thisYear - i);

	const pad = (n: number) => String(n).padStart(2, '0');
	const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
	const todayIso = iso(thisYear, today.getMonth(), today.getDate());

	function parseIso(v: string) {
		const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
		return match ? { y: +match[1], m: +match[2] - 1, d: +match[3] } : null;
	}

	function display(v: string) {
		const p = parseIso(v);
		return p ? `${pad(p.m + 1)}/${pad(p.d)}/${p.y}` : '';
	}

	let text = $state(display(value));
	let open = $state(false);
	let root = $state<HTMLDivElement>();
	// Most people filling this in are teens, so the calendar opens on a plausible birth year.
	let viewYear = $state(parseIso(value)?.y ?? thisYear - 15);
	let viewMonth = $state(parseIso(value)?.m ?? today.getMonth());

	const cells = $derived.by(() => {
		const first = new Date(viewYear, viewMonth, 1).getDay();
		const days = new Date(viewYear, viewMonth + 1, 0).getDate();
		return [...Array(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
	});

	function isFuture(d: number) {
		return new Date(viewYear, viewMonth, d) > today;
	}

	function pick(d: number) {
		value = iso(viewYear, viewMonth, d);
		text = display(value);
		open = false;
	}

	function shiftMonth(step: number) {
		const next = new Date(viewYear, viewMonth + step, 1);
		if (next.getFullYear() < 1900 || next > today) return;
		viewYear = next.getFullYear();
		viewMonth = next.getMonth();
	}

	// Typing digits fills in the slashes, MM/DD/YYYY like Fillout.
	function oninput(event: Event & { currentTarget: HTMLInputElement }) {
		const digits = event.currentTarget.value.replace(/\D/g, '').slice(0, 8);
		text = [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4)].filter(Boolean).join('/');
		event.currentTarget.value = text;
		if (digits.length === 8) {
			const [m, d, y] = [+digits.slice(0, 2), +digits.slice(2, 4), +digits.slice(4)];
			const date = new Date(y, m - 1, d);
			const valid = date.getMonth() === m - 1 && date.getDate() === d && y >= 1900 && date <= today;
			value = valid ? iso(y, m - 1, d) : '';
			if (valid) {
				viewYear = y;
				viewMonth = m - 1;
			}
		} else {
			value = '';
		}
	}

	function onfocusout(event: FocusEvent) {
		if (!root?.contains(event.relatedTarget as Node)) open = false;
	}

	function onkeydown(event: KeyboardEvent) {
		if (event.key === 'Escape') open = false;
	}
</script>

<div class="date" bind:this={root} {onfocusout}>
	<input type="hidden" {name} {value} />
	<div class="control">
		<input
			{id}
			type="text"
			inputmode="numeric"
			autocomplete="bday"
			placeholder="MM/DD/YYYY"
			aria-invalid={invalid}
			value={text}
			{oninput}
			{onkeydown}
		/>
		<button
			type="button"
			class="toggle"
			aria-label="Open calendar"
			aria-expanded={open}
			onclick={() => (open = !open)}
		>
			<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
				<rect x="3.5" y="5" width="17" height="15" rx="2" fill="none" stroke="currentColor" stroke-width="2" />
				<path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
			</svg>
		</button>
	</div>
	{#if open}
		<div class="calendar" role="dialog" aria-label="Choose date of birth" tabindex="-1" {onkeydown}>
			<div class="head">
				<button type="button" class="nav" aria-label="Previous month" onclick={() => shiftMonth(-1)}>‹</button>
				<select aria-label="Month" bind:value={viewMonth}>
					{#each MONTHS as month, i}<option value={i}>{month}</option>{/each}
				</select>
				<select aria-label="Year" bind:value={viewYear}>
					{#each YEARS as year}<option value={year}>{year}</option>{/each}
				</select>
				<button type="button" class="nav" aria-label="Next month" onclick={() => shiftMonth(1)}>›</button>
			</div>
			<div class="grid">
				{#each WEEKDAYS as day}<span class="weekday">{day}</span>{/each}
				{#each cells as d}
					{#if d === null}
						<span></span>
					{:else}
						<button
							type="button"
							class="day"
							class:selected={value === iso(viewYear, viewMonth, d)}
							class:today={iso(viewYear, viewMonth, d) === todayIso}
							disabled={isFuture(d)}
							onclick={() => pick(d)}
						>
							{d}
						</button>
					{/if}
				{/each}
			</div>
		</div>
	{/if}
</div>

<style>
	.date {
		position: relative;
	}
	.control {
		position: relative;
		display: flex;
		align-items: center;
	}
	.control input {
		padding-right: 2.8rem;
	}
	.toggle {
		position: absolute;
		right: 0.4rem;
		display: flex;
		padding: 0.4rem;
		color: var(--ink-soft);
		background: none;
		border: none;
		border-radius: 6px;
	}
	.toggle:hover {
		color: var(--ink);
	}
	.calendar {
		position: absolute;
		z-index: 20;
		top: calc(100% + 6px);
		left: 0;
		width: min(20rem, 100%);
		padding: 0.75rem;
		background: var(--bg-2);
		border: 2px solid var(--ink);
		border-radius: 12px;
		box-shadow: 4px 5px 0 var(--shadow);
	}
	.head {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		margin-bottom: 0.5rem;
	}
	.head select {
		flex: 1 1 auto;
		min-width: 0;
		font: inherit;
		font-weight: 700;
		padding: 0.3rem 0.4rem;
		color: var(--ink);
		background: var(--bg);
		border: 1.5px solid var(--line);
		border-radius: 7px;
	}
	.nav {
		font: inherit;
		font-size: 1.3rem;
		line-height: 1;
		width: 2rem;
		height: 2rem;
		color: var(--ink);
		background: none;
		border: 1.5px solid var(--line);
		border-radius: 7px;
	}
	.grid {
		display: grid;
		grid-template-columns: repeat(7, 1fr);
		gap: 2px;
		text-align: center;
	}
	.weekday {
		font-size: 0.75rem;
		font-weight: 700;
		color: var(--ink-soft);
		padding: 0.2rem 0;
	}
	.day {
		font: inherit;
		font-size: 0.9rem;
		aspect-ratio: 1;
		color: var(--ink);
		background: none;
		border: 1.5px solid transparent;
		border-radius: 7px;
	}
	.day:hover:not(:disabled) {
		background: var(--note);
	}
	.day.today {
		border-color: var(--line);
	}
	.day.selected {
		color: var(--accent-ink);
		background: var(--accent);
		font-weight: 700;
	}
	.day:disabled {
		opacity: 0.3;
	}
</style>
