<script lang="ts">
	import { onMount, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import type { Option } from '$lib/regions';
	import Picker from '../form/picker.svelte';

	let { current }: { current: string } = $props();

	let tz = $state(untrack(() => current));
	let submitting = $state(false);
	let error = $state('');
	let dialog = $state<HTMLDialogElement>();

	const zones = Intl.supportedValuesOf('timeZone');
	const options: Option[] = $derived(
		(zones.includes(tz) ? zones : [tz, ...zones]).map((zone) => ({
			value: zone,
			label: `${zone.replaceAll('_', ' ')} · ${new Date().toLocaleTimeString('en-US', { timeZone: zone, hour: 'numeric', minute: '2-digit' })}`
		}))
	);

	onMount(() => {
		tz = Intl.DateTimeFormat().resolvedOptions().timeZone || tz;
		dialog?.showModal();
	});
</script>

<dialog
	class="tz-modal day-one"
	bind:this={dialog}
	oncancel={(e) => e.preventDefault()}
	onclose={() => dialog?.isConnected && dialog.showModal()}
>
	<form
		method="POST"
		action="/timezone"
		use:enhance={() => {
			submitting = true;
			error = '';
			return async ({ result }) => {
				if (result.type === 'success') await invalidateAll();
				else if (result.type === 'failure') error = String(result.data?.error ?? 'Something went wrong.');
				else error = "We couldn't save that. Try again.";
				submitting = false;
			};
		}}
	>
		<h2>Confirm your timezone</h2>
		<p>Your day ends at 3am in your timezone, so pick the one you'll be posting from.</p>
		<div class="field">
			<label for="tz-modal">Timezone</label>
			<Picker id="tz-modal" name="tz" {options} bind:value={tz} />
		</div>
		<p class="warning">This cannot be changed once you confirm it.</p>
		{#if error}<p class="error">{error}</p>{/if}
		<button class="submit" type="submit" disabled={submitting || !tz}>Confirm timezone</button>
	</form>
</dialog>

<style>
	.tz-modal {
		min-height: 0;
		width: min(30rem, calc(100vw - 32px));
		overflow: visible;
		border: 3px solid var(--ink);
		border-radius: 14px;
		padding: 1.5rem;
		background: var(--bg-2);
		box-shadow: 6px 7px 0 var(--shadow);
	}
	.tz-modal::backdrop {
		background: rgb(43 34 22 / 0.55);
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	h2 {
		margin: 0;
		font-family: var(--font-hand);
		font-weight: 700;
		font-size: 1.6rem;
	}
	p {
		margin: 0;
		line-height: 1.5;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
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
	.submit {
		align-self: flex-start;
		font: inherit;
		font-weight: 700;
		font-size: 1.05rem;
		color: var(--bg);
		background: var(--ink);
		border: 2px solid var(--ink);
		border-radius: 12px 6px 10px 6px/6px 12px 6px 10px;
		padding: calc(0.65rem - 3px) 2rem calc(0.65rem + 3px);
		box-shadow: inset 0 -5px 0 var(--accent);
		transform: rotate(-1deg);
		transition:
			transform 0.15s ease,
			box-shadow 0.15s ease,
			filter 0.15s ease;
	}
	.submit:hover {
		filter: brightness(1.08);
	}
	.submit:active:not(:disabled) {
		box-shadow: none;
		transform: none;
	}
	.submit:disabled {
		opacity: 0.6;
	}
</style>
