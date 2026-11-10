<script lang="ts">
	import { formatDate, formatViews } from '$lib/format';

	let {
		points,
		kind = 'bars',
		label,
		unit = 'views',
		height = 160,
		bare = false,
		compare = []
	}: {
		points: { date: string; value: number }[];
		kind?: 'bars' | 'line';
		label: string;
		unit?: string;
		height?: number;
		bare?: boolean;
		// The period before, lined up day by day with points, drawn as a dashed line to compare against.
		compare?: (number | null)[];
	} = $props();

	// Drawn at the measured width so dots stay round; 600 until the browser has measured it.
	let measured = $state(0);
	let hovered = $state<number | null>(null);
	const WIDTH = $derived(measured || 600);
	const HEIGHT = $derived(height);
	// Room so dots on the top and bottom edges aren't clipped.
	const PAD = $derived(kind === 'line' && !bare ? 6 : 0);

	// Noon so a bare date doesn't slip to the day before in timezones west of UTC.
	const dayLabel = (date: string) => formatDate(`${date}T12:00:00`);
	const signed = (n: number) => `${n < 0 ? '−' : ''}${formatViews(Math.abs(n))}`;

	// Rounds up to a round axis top: 100, 500, 1k, 5k, 10k, 20k, 50k, 100k… (2s only from 10k up).
	const niceCeil = (v: number) => {
		if (v <= 0) return 0;
		const power = 10 ** Math.floor(Math.log10(v));
		const steps = power >= 10_000 ? [1, 2, 5, 10] : [1, 5, 10];
		return (steps.find((m) => m * power >= v) ?? 10) * power;
	};
	const compared = $derived(compare.filter((v): v is number => v != null));
	const top = $derived(niceCeil(Math.max(1, ...points.map((p) => p.value), ...compared)));
	const bottom = $derived(-niceCeil(-Math.min(0, ...points.map((p) => p.value), ...compared)));
	const ticks = $derived(bare ? [] : [top, top / 2, ...(bottom < 0 ? [bottom] : [])]);
	const y = (value: number): number => PAD + (1 - (value - bottom) / (top - bottom)) * (HEIGHT - PAD * 2);
	const step = $derived(WIDTH / Math.max(1, points.length));
	const x = (i: number): number =>
		kind === 'line' ? PAD + (points.length > 1 ? (i / (points.length - 1)) * (WIDTH - PAD * 2) : WIDTH / 2) : step * i + step / 2;

	// Straight lines from dot to dot, so each day's change shows as its own jump.
	const curve = $derived(points.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.value)}`).join(' '));
	const comparePath = $derived(
		compare
			.slice(0, points.length)
			.map((v, i) => (v == null ? '' : `${i && compare[i - 1] != null ? 'L' : 'M'}${x(i)},${y(v)}`))
			.join(' ')
	);
	const showDots = $derived(kind === 'line' && !bare && points.length <= 60);
	const hoveredPoint = $derived(hovered == null ? null : points[hovered]);
</script>

<figure class="chart">
	<div class="plot" class:bare bind:clientWidth={measured}>
		{#if hoveredPoint && hovered != null && !bare}
			<span class="tip" style="left: {(x(hovered) / WIDTH) * 100}%">
				<strong>{hoveredPoint.value.toLocaleString()}</strong>
				{unit} · {dayLabel(hoveredPoint.date)}
				{#if compare[hovered] != null}· before: {compare[hovered]?.toLocaleString()}{/if}
			</span>
		{/if}
		<svg
			viewBox="0 0 {WIDTH} {HEIGHT}"
			preserveAspectRatio="none"
			role="img"
			aria-label={label}
			style="height: {HEIGHT}px"
			onmouseleave={() => (hovered = null)}
		>
			<defs>
				<linearGradient id="fade" x1="0" x2="0" y1="0" y2="1">
					<stop offset="0%" stop-color="var(--accent)" stop-opacity="0.32" />
					<stop offset="100%" stop-color="var(--accent)" stop-opacity="0" />
				</linearGradient>
			</defs>
			<line class="base" x1="0" x2={WIDTH} y1={y(0)} y2={y(0)} />
			{#each ticks as tick}
				<line class="grid" x1="0" x2={WIDTH} y1={y(tick)} y2={y(tick)} />
				<text class="tick" x="2" y={y(tick) - 4}>{signed(tick)}</text>
			{/each}
			{#if kind === 'line' && points.length}
				<path class="area" d="{curve} L{x(points.length - 1)},{HEIGHT} L{x(0)},{HEIGHT} Z" />
				{#if comparePath}<path class="before" d={comparePath} />{/if}
				<path class="stroke" d={curve} />
				{#if hovered != null && !bare}
					<line class="guide" x1={x(hovered)} x2={x(hovered)} y1="0" y2={HEIGHT} />
				{/if}
				{#if showDots}
					{#each points as p, i (p.date)}
						<circle class="dot" class:on={hovered === i} cx={x(i)} cy={y(p.value)} r={hovered === i ? 5 : 3.5} />
					{/each}
				{/if}
			{/if}
			{#each points as p, i (p.date)}
				{#if kind === 'bars'}
					<rect
						class="bar"
						class:down={p.value < 0}
						class:on={hovered === i}
						x={step * i + step * 0.15}
						width={step * 0.7}
						y={Math.min(y(p.value), y(0))}
						height={Math.max(1, Math.abs(y(p.value) - y(0)))}
					/>
				{/if}
				<rect
					class="hit"
					role="presentation"
					x={kind === 'line' ? x(i) - step / 2 : step * i}
					width={step}
					y="0"
					height={HEIGHT}
					onmouseenter={() => (hovered = i)}
				>
					<title>{dayLabel(p.date)}: {p.value.toLocaleString()} {unit}</title>
				</rect>
			{/each}
			{#if comparePath && kind === 'bars'}
				<path class="before" d={comparePath} />
			{/if}
		</svg>
	</div>
	{#if points.length && !bare}
		<figcaption>
			<span>{dayLabel(points[0].date)}</span>
			<span>{dayLabel(points[points.length - 1].date)}</span>
		</figcaption>
	{/if}
</figure>

<style>
	.chart {
		margin: 0;
		font-family: var(--font-hand);
	}

	.plot {
		position: relative;
		padding-top: 1.3rem;
	}

	.plot.bare {
		padding-top: 0;
	}

	.grid {
		stroke: var(--line);
		stroke-width: 1;
		stroke-dasharray: 2 5;
		vector-effect: non-scaling-stroke;
	}

	.tick {
		font-size: 0.75rem;
		font-weight: 700;
		fill: var(--ink-soft);
		font-variant-numeric: tabular-nums;
	}

	.tip {
		position: absolute;
		top: 0;
		transform: translateX(-50%);
		white-space: nowrap;
		font-size: 0.8rem;
		color: var(--ink-soft);
		background: var(--bg-2);
		border: 1.5px solid var(--ink);
		border-radius: 8px;
		padding: 1px 8px;
		pointer-events: none;
		z-index: 1;
	}

	.tip strong {
		color: var(--ink);
	}

	svg {
		display: block;
		width: 100%;
		overflow: visible;
	}

	.base {
		stroke: var(--line);
		stroke-width: 1.5;
		stroke-dasharray: 6 4;
		vector-effect: non-scaling-stroke;
	}

	.bar {
		fill: var(--accent);
		stroke: var(--ink);
		stroke-width: 1.5;
		vector-effect: non-scaling-stroke;
	}

	.bar.down {
		fill: var(--ink-soft);
	}

	.bar.on {
		filter: brightness(1.15);
	}

	.area {
		fill: url(#fade);
	}

	.stroke {
		fill: none;
		stroke: var(--accent);
		stroke-width: 2.5;
		stroke-linejoin: round;
		stroke-linecap: round;
		vector-effect: non-scaling-stroke;
	}

	.before {
		fill: none;
		pointer-events: none;
		stroke: var(--ink-soft);
		stroke-width: 1.5;
		stroke-dasharray: 5 4;
		opacity: 0.7;
		vector-effect: non-scaling-stroke;
	}

	.guide {
		stroke: var(--ink-soft);
		stroke-width: 1;
		stroke-dasharray: 3 3;
		vector-effect: non-scaling-stroke;
	}

	.dot {
		fill: var(--bg-2);
		stroke: var(--accent);
		stroke-width: 2;
		vector-effect: non-scaling-stroke;
	}

	.dot.on {
		fill: var(--accent);
	}

	.hit {
		fill: transparent;
	}

	figcaption {
		display: flex;
		justify-content: space-between;
		margin-top: 6px;
		font-size: 0.8rem;
		font-weight: 700;
		color: var(--ink-soft);
	}
</style>
