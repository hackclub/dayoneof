<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import type { Option } from '$lib/regions';
	import Picker from '../form/picker.svelte';

	let { data, form } = $props();

	let tz = $state(untrack(() => data.tz));
	let submitting = $state(false);

	const zones = Intl.supportedValuesOf('timeZone');
	const options: Option[] = $derived(
		(zones.includes(tz) ? zones : [tz, ...zones]).map((zone) => ({
			value: zone,
			label: `${zone.replaceAll('_', ' ')} · ${new Date().toLocaleTimeString('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' })}`
		}))
	);

	onMount(() => {
		if (!data.confirmed) tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz;
	});
</script>

<svelte:head>
	<title>Your timezone · Day One Of</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page day-one">
	<header class="bar">
		<a class="brand" href="/home">Day One Of</a>
		<a class="ghost-btn" href="/api/auth/logout">Sign out</a>
	</header>

	<main class="frame">
		<div class="sheet">
			<h1>Your timezone</h1>
			{#if form?.success}
				<p class="done">Saved! Your day now ends at 3am {tz.replaceAll('_', ' ')}.</p>
				<a class="submit" href="/home">Back to home</a>
			{:else if data.confirmed}
				<p>Your timezone is set to <strong>{data.tz.replaceAll('_', ' ')}</strong> and can't be changed.</p>
				<a class="submit" href="/home">Back to home</a>
			{:else}
				<p>
					Your day ends at 3am in your timezone. We're currently assuming
					<strong>{data.tz.replaceAll('_', ' ')}</strong> from your Slack profile.
				</p>
				<form
					method="POST"
					use:enhance={() => {
						submitting = true;
						return async ({ update }) => {
							await update({ reset: false });
							submitting = false;
						};
					}}
				>
					<div class="field">
						<label for="tz">Timezone</label>
						<Picker id="tz" name="tz" {options} bind:value={tz} />
					</div>
					<p class="warning">This cannot be changed once you confirm it.</p>
					{#if form?.error}<p class="error">{form.error}</p>{/if}
					<button class="submit" type="submit" disabled={submitting || !tz}>Confirm timezone</button>
				</form>
			{/if}
		</div>
	</main>
</div>

<style>
	.page {
		--frame: clamp(1rem, 2.6vw, 3.25rem);
		--cursor: url('/cursor_small.png') 1 0, auto;
		--cursor-pointer: url('/cursor_pointer_small.png') 8 7, pointer;
		--cursor-text: url('/cursor_text_small.png') 13 14, text;
		display: flex;
		flex-direction: column;
	}
	h1 {
		font-family: var(--font-hand);
		font-weight: 700;
		font-size: clamp(1.8rem, 1vh + 2vw, 2.6rem);
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
	.ghost-btn,
	.submit {
		align-self: flex-start;
		font: inherit;
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
	.submit {
		font-size: 1.05rem;
		padding: calc(0.65rem - 3px) 2rem calc(0.65rem + 3px);
	}
	.ghost-btn:hover,
	.submit:hover {
		filter: brightness(1.08);
	}
	.ghost-btn:active,
	.submit:active:not(:disabled) {
		box-shadow: none;
		transform: none;
	}
	.submit:disabled {
		opacity: 0.6;
	}
	.frame {
		display: flex;
		justify-content: center;
		padding: clamp(1.75rem, 4.4vh, 3.5rem) var(--frame);
	}
	.sheet {
		display: flex;
		flex-direction: column;
		gap: 1.25rem;
		width: min(40rem, 100%);
		padding: clamp(1.25rem, 3vw, 2.5rem);
		background: var(--paper), var(--pencil);
		border: 3.5px solid transparent;
		border-radius: 18px 10px 16px 12px/12px 16px 10px 18px;
		box-shadow: 6px 7px 0 var(--shadow);
	}
	.sheet p {
		margin: 0;
		line-height: 1.5;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 1.1rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		min-width: 0;
	}
	label {
		font-weight: 700;
		font-size: 0.95rem;
	}
	.warning,
	.error {
		font-weight: 700;
		color: var(--accent);
	}
	.error {
		font-size: 0.85rem;
	}
	.done {
		font-weight: 700;
	}
</style>
