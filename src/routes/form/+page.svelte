<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { COUNTRIES, STATES, NO_POSTAL_CODE, DEFAULT_COUNTRY, validateShipping } from '$lib/regions';
	import { sprite, tape } from '$lib/asset_sheet';
	import { PRIZES } from '$lib/prizes';
	import { HELP_URL } from '$lib/help';
	import tshirtimage from '$lib/assets/tshirtimage.webp';
	import orpheusplushie from '$lib/assets/orpheusplushie.webp';
	import socks from '$lib/assets/socks.webp';
	import heidisticker from '$lib/assets/heidisticker.webp';
	import Picker from './picker.svelte';
	import DatePicker from './date_picker.svelte';

	let { data, form } = $props();

	const IMAGES: Record<string, string> = {
		Stickers: heidisticker,
		'T-shirt': tshirtimage,
		'Socks + pin': socks,
		Plushie: orpheusplushie
	};
	const prizeItems = [
		...PRIZES.map((p) => ({ img: IMAGES[p.name], name: p.name, label: `${p.milestone}-day prize` })),
		{ img: null, name: '$500 fund', label: 'most-viewed creator' }
	];
	const prizeLoop = [...prizeItems, ...prizeItems];

	const initial = untrack(() => form?.values ?? data.saved);

	let firstName = $state(initial?.firstName ?? '');
	let lastName = $state(initial?.lastName ?? '');
	let email = $state(initial?.email ?? '');
	let slackUsername = $state(initial?.slackUsername ?? '');
	let addressLine1 = $state(initial?.addressLine1 ?? '');
	let addressLine2 = $state(initial?.addressLine2 ?? '');
	let city = $state(initial?.city ?? '');
	let stateValue = $state(initial?.state ?? '');
	let zip = $state(initial?.zip ?? '');
	let country = $state(initial?.country || DEFAULT_COUNTRY);
	let birthday = $state(initial?.birthday ?? '');
	let submitting = $state(false);
	// Once a submit is blocked, errors re-check live so they clear as each field is fixed.
	let attempted = $state(false);

	const clientErrors = $derived(
		validateShipping({
			firstName,
			lastName,
			email,
			addressLine1,
			city,
			state: stateValue,
			zip,
			country,
			birthday
		})
	);
	const errors: Record<string, string> = $derived(
		attempted ? clientErrors : (form?.errors ?? {})
	);
	const states = $derived(STATES[country]);
	const zipOptional = $derived(NO_POSTAL_CODE.has(country));
</script>

<svelte:head>
	<title>Claim your prizes · Day One Of</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page day-one">
	<header class="bar">
		<a class="brand" href="/home">Day One Of</a>
		{#if data.session}
			<a class="ghost-btn" href="/api/auth/logout">Sign out</a>
		{/if}
	</header>

	<main class="frame">
		<div class="sheet">
			<h1>Claim your prizes</h1>

			<div class="prize-viewport">
				<div class="prize-cluster">
					{#each prizeLoop as prize, i}
						<div
							class="prize-symbol"
							class:unlocked={data.prizes.includes(prize.name)}
							aria-hidden={i >= prizeItems.length}
						>
							<span class="icon-badge">
								<span class="tape-strip" style={tape('prize', i % prizeItems.length)}></span>
								{#if prize.img}
									<img src={prize.img} alt="" loading="lazy" decoding="async" />
								{:else}
									<span class="dollar" style={sprite('badge_dollar')}></span>
								{/if}
							</span>
							<span class="prize-name">{prize.name}</span>
							<span class="prize-day">
								{data.prizes.includes(prize.name) ? 'Unlocked!' : prize.label}
							</span>
						</div>
					{/each}
				</div>
			</div>

			{#if !data.session}
				<p>Sign in so we can match this form to your streak.</p>
				<a class="submit" href="/api/auth/login?next=/form">Sign in with Hack Club</a>
			{:else if data.prizes.length === 0}
				<p>
					You haven't unlocked a prize yet. Hit a 2-day streak and come back here to tell us where
					to send your stickers.
				</p>
				<a class="submit" href="/home">Back to home</a>
			{:else if form?.success}
				<p class="done">
					Got it! We'll ship your prizes to that address and email you when they're in the mail. If
					you unlock more, they'll go to the same place, so come back here if you move.
				</p>
				<a class="submit" href="/home">Back to home</a>
			{:else}
				<div class="prizes">
					<span>You've unlocked:</span>
					{#each data.prizes as prize}<span class="chip">{prize}</span>{/each}
				</div>
				{#if data.saved?.submitted}
					<p class="hint">You've already sent us your address. Submitting again replaces it.</p>
				{/if}

				<form
					method="POST"
					novalidate
					use:enhance={({ cancel }) => {
						if (Object.keys(clientErrors).length) {
							attempted = true;
							cancel();
							return;
						}
						submitting = true;
						return async ({ update }) => {
							await update({ reset: false });
							submitting = false;
						};
					}}
				>
					<fieldset>
						<legend>Where you can receive stickers <span class="req">*</span></legend>

						<div class="field">
							<label for="addressLine1">Address</label>
							<input
								id="addressLine1"
								name="addressLine1"
								autocomplete="address-line1"
								aria-invalid={!!errors.addressLine1}
								bind:value={addressLine1}
							/>
							{#if errors.addressLine1}<p class="error">{errors.addressLine1}</p>{/if}
						</div>

						<div class="field">
							<label for="addressLine2">Address Line 2 <span class="optional">(Optional)</span></label>
							<input
								id="addressLine2"
								name="addressLine2"
								autocomplete="address-line2"
								bind:value={addressLine2}
							/>
						</div>

						<div class="row">
							<div class="field">
								<label for="city">City</label>
								<input
									id="city"
									name="city"
									autocomplete="address-level2"
									aria-invalid={!!errors.city}
									bind:value={city}
								/>
								{#if errors.city}<p class="error">{errors.city}</p>{/if}
							</div>
							<div class="field">
								<label for="state">State / Province</label>
								{#if states}
									{#key country}
										<Picker
											id="state"
											name="state"
											options={states}
											placeholder="Select…"
											invalid={!!errors.state}
											bind:value={stateValue}
										/>
									{/key}
								{:else}
									<input
										id="state"
										name="state"
										autocomplete="address-level1"
										bind:value={stateValue}
									/>
								{/if}
								{#if errors.state}<p class="error">{errors.state}</p>{/if}
							</div>
						</div>

						<div class="row">
							<div class="field">
								<label for="zip">
									ZIP / Postal code
									{#if zipOptional}<span class="optional">(Optional)</span>{/if}
								</label>
								<input
									id="zip"
									name="zip"
									autocomplete="postal-code"
									aria-invalid={!!errors.zip}
									bind:value={zip}
								/>
								{#if errors.zip}<p class="error">{errors.zip}</p>{/if}
							</div>
							<div class="field">
								<label for="country">Country</label>
								<Picker
									id="country"
									name="country"
									options={COUNTRIES}
									invalid={!!errors.country}
									bind:value={country}
									onchange={() => (stateValue = '')}
								/>
								{#if errors.country}<p class="error">{errors.country}</p>{/if}
							</div>
						</div>
					</fieldset>

					<div class="row">
						<div class="field">
							<label for="firstName">First Name <span class="req">*</span></label>
							<input
								id="firstName"
								name="firstName"
								autocomplete="given-name"
								aria-invalid={!!errors.firstName}
								bind:value={firstName}
							/>
							{#if errors.firstName}<p class="error">{errors.firstName}</p>{/if}
						</div>
						<div class="field">
							<label for="lastName">Last Name <span class="req">*</span></label>
							<input
								id="lastName"
								name="lastName"
								autocomplete="family-name"
								aria-invalid={!!errors.lastName}
								bind:value={lastName}
							/>
							{#if errors.lastName}<p class="error">{errors.lastName}</p>{/if}
						</div>
					</div>

					<div class="field">
						<label for="email">Email <span class="req">*</span></label>
						<p class="hint">We'll let you know when they're in the mail</p>
						<input
							id="email"
							name="email"
							type="email"
							autocomplete="email"
							aria-invalid={!!errors.email}
							bind:value={email}
						/>
						{#if errors.email}<p class="error">{errors.email}</p>{/if}
					</div>

					<div class="field">
						<label for="slackUsername">Slack Username</label>
						<input id="slackUsername" name="slackUsername" autocomplete="off" bind:value={slackUsername} />
					</div>

					<div class="field">
						<label for="birthday">Date of birth <span class="req">*</span></label>
						<p class="hint">Month, day, and year you were born.</p>
						<DatePicker id="birthday" name="birthday" invalid={!!errors.birthday} bind:value={birthday} />
						{#if errors.birthday}<p class="error">{errors.birthday}</p>{/if}
					</div>

					{#if form?.error}<p class="error">{form.error}</p>{/if}
					{#if form?.error || Object.keys(errors).length}
						<p class="hint">
							Fix the fields marked above. If your address is right and it still won't let you
							submit, ask in
							<a href={HELP_URL} target="_blank" rel="noopener">#dayoneof-help</a>.
						</p>
					{/if}

					<button type="submit" class="submit" disabled={submitting}>
						{submitting ? 'Submitting…' : 'Submit'}
					</button>
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
	.sheet > p {
		margin: 0;
		line-height: 1.5;
	}
	.prizes {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		font-weight: 700;
	}
	.chip {
		font-size: 0.9rem;
		color: var(--accent-ink);
		background: var(--accent);
		border-radius: 999px;
		padding: 0.2rem 0.75rem;
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 1.4rem;
	}
	fieldset {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
		margin: 0;
		padding: 0;
		border: none;
	}
	legend {
		padding: 0;
		margin-bottom: 0.9rem;
		font-weight: 700;
		font-size: 1.05rem;
	}
	.row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.9rem;
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
	fieldset label {
		font-weight: 600;
		font-size: 0.85rem;
		color: var(--ink-soft);
	}
	.req {
		color: var(--accent);
	}
	.optional,
	.hint {
		font-weight: 400;
		font-size: 0.85rem;
		color: var(--ink-soft);
		margin: 0;
	}
	.field > .hint {
		margin-top: -0.2rem;
	}
	.error {
		margin: 0;
		font-size: 0.85rem;
		font-weight: 700;
		color: var(--accent);
	}
	.done {
		font-weight: 700;
	}
	.page :global(:where(input:not([type='hidden']))) {
		width: 100%;
		font: inherit;
		font-size: 1rem;
		color: var(--ink);
		background: var(--bg-2);
		border: 2px solid var(--line);
		border-radius: 10px;
		padding: 0.6rem 0.85rem;
		outline: none;
		transition: border-color 0.12s ease;
	}
	.page :global(input:focus) {
		border-color: var(--ink);
	}
	.page :global(input[aria-invalid='true']) {
		border-color: var(--accent);
	}
	.prize-viewport {
		overflow: hidden;
		margin-inline: calc(-1 * clamp(1.25rem, 3vw, 2.5rem));
		padding-block: 12px 4px;
		mask-image: linear-gradient(
			to right,
			transparent 0,
			#000 22px,
			#000 calc(100% - 22px),
			transparent 100%
		);
	}
	.prize-cluster {
		display: flex;
		gap: 20px;
		width: max-content;
		animation: prize-scroll 18s linear infinite;
	}
	.prize-viewport:hover .prize-cluster {
		animation-play-state: paused;
	}
	@keyframes prize-scroll {
		from {
			transform: translateX(0);
		}
		to {
			transform: translateX(calc(-50% - 10px));
		}
	}
	.prize-symbol {
		width: 130px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 9px;
		text-align: center;
	}
	.prize-symbol:nth-child(4n + 1) {
		transform: rotate(-4deg);
	}
	.prize-symbol:nth-child(4n + 2) {
		transform: rotate(3deg);
	}
	.prize-symbol:nth-child(4n + 3) {
		transform: rotate(-2deg);
	}
	.prize-symbol:nth-child(4n) {
		transform: rotate(4deg);
	}
	.icon-badge {
		position: relative;
		width: 108px;
		height: 108px;
		border-radius: 50%;
		border: 3.5px solid transparent;
		background: var(--paper), var(--pencil);
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 4px 5px 0 var(--shadow);
	}
	.icon-badge img {
		width: 70%;
		height: 70%;
		object-fit: contain;
	}
	.dollar {
		width: 58%;
		height: 58%;
	}
	.tape-strip {
		position: absolute;
		top: -9px;
		left: 50%;
		transform: translateX(-50%) rotate(var(--tilt));
		width: calc(66px + var(--grow) * 3);
		height: calc(18px + var(--grow));
		background: var(--tape-bg);
	}
	.prize-name {
		font-family: var(--font-hand);
		font-weight: 700;
		font-size: 1rem;
	}
	.prize-day {
		font-size: 0.82rem;
		color: var(--ink-soft);
	}
	.unlocked .prize-day {
		font-weight: 700;
		color: var(--accent);
	}
	@media (prefers-reduced-motion: reduce) {
		.prize-cluster {
			animation: none;
		}
		.prize-viewport {
			overflow-x: auto;
		}
	}
	@media (max-width: 560px) {
		.row {
			grid-template-columns: 1fr;
		}
	}
</style>
