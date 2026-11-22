<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { COUNTRIES, STATES, NO_POSTAL_CODE, DEFAULT_COUNTRY, validateShipping } from '$lib/regions';
	import { SHIRT_PRIZE, SHIRT_SIZES } from '$lib/prizes';
	import { HELP_URL } from '$lib/help';
	import { tape } from '$lib/asset_sheet';
	import tshirtimage from '$lib/assets/tshirtimage.webp';
	import orpheusplushie from '$lib/assets/orpheusplushie.webp';
	import socks from '$lib/assets/socks.webp';
	import heidisticker from '$lib/assets/heidisticker.webp';
	import Picker from '../form/picker.svelte';
	import DatePicker from '../form/date_picker.svelte';

	let { data, form } = $props();

	const IMAGES: Record<string, string> = {
		Stickers: heidisticker,
		'T-shirt': tshirtimage,
		'Socks + pin': socks,
		Plushie: orpheusplushie
	};
	const SCORES = Array.from({ length: 10 }, (_, i) => String(i + 1));
	const FIVE = ['1', '2', '3', '4', '5'];
	const SCALES = [
		{ key: 'reviewsHelped', label: 'Did the reviewer feedback on your videos help you?' },
		{ key: 'engagementHappy', label: 'Are you happy with the engagement (views, likes) your videos got?' },
		{ key: 'reviewsFair', label: 'Do you feel our feedback and review system was fair?' },
		{ key: 'othersHelped', label: "Did watching other people's videos help you improve your own?" }
	] as const;
	const CHOICES = [
		{ key: 'doAgain', label: 'Would you do Day One Of again?' },
		{ key: 'keepPosting', label: 'Will you keep posting videos now that the program is over?' }
	] as const;

	const initial = untrack(() => form?.values ?? data.saved);
	// Shipping is never prefilled so people re-check it; kept only after a failed submit.
	const typed = untrack(() => form?.values);

	let firstName = $state(typed?.firstName ?? '');
	let lastName = $state(typed?.lastName ?? '');
	let email = $state(typed?.email ?? '');
	let addressLine1 = $state(typed?.addressLine1 ?? '');
	let addressLine2 = $state(typed?.addressLine2 ?? '');
	let city = $state(typed?.city ?? '');
	let stateValue = $state(typed?.state ?? '');
	let zip = $state(typed?.zip ?? '');
	let country = $state(typed?.country || DEFAULT_COUNTRY);
	let birthday = $state(typed?.birthday ?? '');
	let shirtSize = $state(typed?.shirtSize ?? '');
	let phone = $state(typed?.phone ?? '');
	let customs = $state(false);

	let score = $state(initial?.score ?? '');
	let heardFrom = $state(initial?.heardFrom ?? '');
	let improvedDays: string[] = $state(initial?.improvedDays ?? []);
	let scales = $state({
		reviewsHelped: initial?.reviewsHelped ?? '',
		engagementHappy: initial?.engagementHappy ?? '',
		reviewsFair: initial?.reviewsFair ?? '',
		othersHelped: initial?.othersHelped ?? ''
	});
	let choices = $state({ doAgain: initial?.doAgain ?? '', keepPosting: initial?.keepPosting ?? '' });
	let minutesPerVideo = $state(initial?.minutesPerVideo ?? '');
	let bestVideo = $state(initial?.bestVideo ?? '');
	let doingWell = $state(initial?.doingWell ?? '');
	let doBetter = $state(initial?.doBetter ?? '');
	let nextProgram = $state(initial?.nextProgram ?? '');

	let submitting = $state(false);
	let attempted = $state(false);

	const needsShirt = $derived(data.prizes.includes(SHIRT_PRIZE));
	const shirtOptions = SHIRT_SIZES.map((size) => ({ value: size, label: size }));
	const states = $derived(STATES[country]);
	const zipOptional = $derived(NO_POSTAL_CODE.has(country));

	const clientErrors = $derived({
		...validateShipping(
			{ firstName, lastName, email, addressLine1, city, state: stateValue, zip, country, birthday, phone, shirtSize },
			needsShirt
		),
		...(customs ? {} : { customs: 'Tick this to confirm you understand.' }),
		...(score ? {} : { score: 'Pick a number from 1 to 10.' }),
		...(heardFrom.trim() ? {} : { heardFrom: 'Tell us where you heard about it.' }),
		...Object.fromEntries(
			SCALES.filter((q) => !scales[q.key]).map((q) => [q.key, 'Pick a number from 1 to 5.'])
		),
		...Object.fromEntries(CHOICES.filter((q) => !choices[q.key]).map((q) => [q.key, 'Pick an answer.'])),
		...(/^\d+$/.test(minutesPerVideo.trim()) && Number(minutesPerVideo) >= 1
			? {}
			: { minutesPerVideo: 'Enter a whole number of minutes.' }),
		...(/^https?:\/\/\S+\.\S+$/.test(bestVideo.trim())
			? {}
			: { bestVideo: 'Paste a link to the video.' }),
		...(nextProgram.trim() ? {} : { nextProgram: 'Tell us what you would want to see.' })
	} as Record<string, string>);
	async function showFirstError(formEl: HTMLFormElement) {
		await tick();
		const field = formEl.querySelector('.error')?.closest('.field, fieldset');
		if (!field) return;
		field.scrollIntoView({ behavior: 'smooth', block: 'center' });
		field.querySelector<HTMLElement>('input:not([type="hidden"]), textarea, button')?.focus({ preventScroll: true });
	}
	const errors: Record<string, string> = $derived(attempted ? clientErrors : (form?.errors ?? {}));
</script>

<svelte:head>
	<title>Wrapping up · Day One Of</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="page day-one">
	<header class="bar">
		<a class="brand" href="/home">Day One Of{#if data.isDev}<span class="dev-tag">(DEV)</span>{/if}</a>
		{#if data.session}
			<a class="ghost-btn" href="/api/auth/logout">Sign out</a>
		{/if}
	</header>

	<main class="frame">
		{#if !data.reachedDay2 || !data.open || form?.success}
			<div class="sheet">
				<h1>You made it!</h1>
				{#if !data.reachedDay2}
					<p>This form is for people who reached a 2-day streak, so there's nothing to fill out here.</p>
					<a class="submit" href="/home">Back to home</a>
				{:else if !data.open}
					<p>This form opens once you've posted 25 days or the program ends on December 7. Keep going!</p>
					<a class="submit" href="/home">Back to home</a>
				{:else if form?.success}
					<p class="done">
						Thank you for doing Day One Of! We'll email you when your prizes are in the mail.
					</p>
					<a class="submit" href="/home">Back to home</a>
				{/if}
			</div>
		{:else}
			<form
				class="stack"
				method="POST"
				novalidate
				use:enhance={({ cancel, formElement }) => {
					if (Object.keys(clientErrors).length) {
						attempted = true;
						cancel();
						showFirstError(formElement);
						return;
					}
					submitting = true;
					return async ({ update }) => {
						await update({ reset: false });
						submitting = false;
						showFirstError(formElement);
					};
				}}
			>
				<section class="sheet">
					<h1>Congrats on your prizes!</h1>
					<p class="intro">
						Thanks for participating in #dayoneof!! This was the first Hack Club program I ran, and it
						means a lot that you were part of it. I hope you feel more confident in creating content
						from your time uploading! - @darsh
					</p>
					{#if data.saved?.submitted}
						<p class="hint">You've already answered. Submitting again replaces your answers.</p>
					{/if}

					<h2>You'll be receiving:</h2>
					<div class="prize-row">
						{#each data.prizes as prize, i}
							<div class="prize-symbol">
								<span class="icon-badge">
									<span class="tape-strip" style={tape('prize', i)}></span>
									<img src={IMAGES[prize]} alt="" loading="lazy" decoding="async" />
								</span>
								<span class="prize-name">{prize}</span>
							</div>
						{/each}
					</div>
					<p class="hint">
						Something missing? Ask in
						<a href={HELP_URL} target="_blank" rel="noopener">#dayoneof-help</a> before submitting.
					</p>

					<p class="warning">
						Please double-check your address, if it is invalid we will not be able to ship you your
						prizes.
					</p>

					<fieldset class="group">
						<legend>Shipping address <span class="req">*</span></legend>

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
							<input id="addressLine2" name="addressLine2" autocomplete="address-line2" bind:value={addressLine2} />
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
									<input id="state" name="state" autocomplete="address-level1" bind:value={stateValue} />
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

					<div class="row">
						<div class="field">
							<label for="email">Email <span class="req">*</span></label>
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
							<label for="phone">Phone number <span class="req">*</span></label>
							<input
								id="phone"
								name="phone"
								type="tel"
								autocomplete="tel"
								placeholder="+1 555 123 4567"
								aria-invalid={!!errors.phone}
								bind:value={phone}
							/>
							{#if errors.phone}<p class="error">{errors.phone}</p>{/if}
						</div>
					</div>

					<div class="field">
						<label for="slackUsername">Slack Username</label>
						<input
							id="slackUsername"
							name="slackUsername"
							value={data.slackUsername}
							readonly
							tabindex="-1"
						/>
					</div>

					<div class="field">
						<label for="birthday">Date of birth <span class="req">*</span></label>
						<DatePicker id="birthday" name="birthday" invalid={!!errors.birthday} bind:value={birthday} />
						{#if errors.birthday}<p class="error">{errors.birthday}</p>{/if}
					</div>

					{#if needsShirt}
						<div class="field">
							<label for="shirtSize">Shirt size <span class="req">*</span></label>
							<Picker
								id="shirtSize"
								name="shirtSize"
								options={shirtOptions}
								invalid={!!errors.shirtSize}
								bind:value={shirtSize}
							/>
							{#if errors.shirtSize}<p class="error">{errors.shirtSize}</p>{/if}
						</div>
					{/if}

				</section>

				<section class="sheet">
					<h2>How did it go?</h2>

					<fieldset class="field">
						<legend>
							On a scale from 1 to 10, how likely are you to recommend Day One Of to a friend?
							<span class="req">*</span>
						</legend>
						<p class="hint">1 = not likely at all, 10 = extremely likely</p>
						<div class="scale" aria-invalid={!!errors.score}>
							{#each SCORES as n}
								<label class="score" class:picked={score === n}>
									<input type="radio" name="score" value={n} bind:group={score} />
									<span>{n}</span>
								</label>
							{/each}
						</div>
						{#if errors.score}<p class="error">{errors.score}</p>{/if}
					</fieldset>

					<div class="field">
						<label for="heardFrom">How'd you hear about Day One Of? <span class="req">*</span></label>
						<p class="hint">Be as specific as possible. Ex. "My friend told me about it in #lounge"</p>
						<input id="heardFrom" name="heardFrom" aria-invalid={!!errors.heardFrom} bind:value={heardFrom} />
						{#if errors.heardFrom}<p class="error">{errors.heardFrom}</p>{/if}
					</div>

					<fieldset class="field">
						<legend>During which days do you feel your videos improved?</legend>
						<p class="hint">Tick every stretch where you felt yourself getting better.</p>
						<div class="scale">
							{#each data.stretches as stretch}
								<label class="score wide" class:picked={improvedDays.includes(stretch)}>
									<input type="checkbox" name="improvedDays" value={stretch} bind:group={improvedDays} />
									<span>{stretch.replace('-', '–')}</span>
								</label>
							{/each}
						</div>
					</fieldset>

					{#each SCALES as q}
						<fieldset class="field">
							<legend>{q.label} <span class="req">*</span></legend>
							<p class="hint">1 = not at all, 5 = completely</p>
							<div class="scale" aria-invalid={!!errors[q.key]}>
								{#each FIVE as n}
									<label class="score" class:picked={scales[q.key] === n}>
										<input type="radio" name={q.key} value={n} bind:group={scales[q.key]} />
										<span>{n}</span>
									</label>
								{/each}
							</div>
							{#if errors[q.key]}<p class="error">{errors[q.key]}</p>{/if}
						</fieldset>
					{/each}

					<div class="field">
						<label for="minutesPerVideo">
							About how many minutes did a typical video take you to make? <span class="req">*</span>
						</label>
						<p class="hint">Filming, editing and posting together.</p>
						<input
							id="minutesPerVideo"
							name="minutesPerVideo"
							type="number"
							inputmode="numeric"
							min="1"
							aria-invalid={!!errors.minutesPerVideo}
							bind:value={minutesPerVideo}
						/>
						{#if errors.minutesPerVideo}<p class="error">{errors.minutesPerVideo}</p>{/if}
					</div>

					<div class="field">
						<label for="bestVideo">Link your best video <span class="req">*</span></label>
						<p class="hint">The one you're proudest of, not necessarily the most viewed.</p>
						<input
							id="bestVideo"
							name="bestVideo"
							type="url"
							placeholder="https://"
							aria-invalid={!!errors.bestVideo}
							bind:value={bestVideo}
						/>
						{#if errors.bestVideo}<p class="error">{errors.bestVideo}</p>{/if}
					</div>

					{#each CHOICES as q}
						<fieldset class="field">
							<legend>{q.label} <span class="req">*</span></legend>
							<div class="scale" aria-invalid={!!errors[q.key]}>
								{#each data.yesMaybeNo as answer}
									<label class="score wide" class:picked={choices[q.key] === answer}>
										<input type="radio" name={q.key} value={answer} bind:group={choices[q.key]} />
										<span>{answer}</span>
									</label>
								{/each}
							</div>
							{#if errors[q.key]}<p class="error">{errors[q.key]}</p>{/if}
						</fieldset>
					{/each}

					<div class="field">
						<label for="doingWell">What did Day One Of do well?</label>
						<textarea id="doingWell" name="doingWell" rows="3" bind:value={doingWell}></textarea>
					</div>

					<div class="field">
						<label for="doBetter">What could Day One Of have done better?</label>
						<textarea id="doBetter" name="doBetter" rows="3" bind:value={doBetter}></textarea>
					</div>

					<div class="field">
						<label for="nextProgram">
							If Hack Club were to run another program based primarily on content creation, what would
							you want to see? <span class="req">*</span>
						</label>
						<textarea
							id="nextProgram"
							name="nextProgram"
							rows="3"
							aria-invalid={!!errors.nextProgram}
							bind:value={nextProgram}
						></textarea>
						{#if errors.nextProgram}<p class="error">{errors.nextProgram}</p>{/if}
					</div>

					<div class="field">
						<label class="check">
							<input type="checkbox" name="customs" aria-invalid={!!errors.customs} bind:checked={customs} />
							<span>
								I understand I may be charged customs fees to pick up my package, and Hack Club is not
								responsible for and cannot cover customs fees. <span class="req">*</span>
							</span>
						</label>
						{#if errors.customs}<p class="error">{errors.customs}</p>{/if}
					</div>

					{#if form?.error}<p class="error">{form.error}</p>{/if}
					{#if form?.error || Object.keys(errors).length}
						<p class="hint">
							Fix the fields marked above. Still stuck? Ask in
							<a href={HELP_URL} target="_blank" rel="noopener">#dayoneof-help</a>.
						</p>
					{/if}

					<button type="submit" class="submit" disabled={submitting}>
						{submitting ? 'Submitting…' : 'Submit'}
					</button>
				</section>
			</form>
		{/if}
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
	h1,
	h2 {
		font-family: var(--font-hand);
		font-weight: 700;
		margin: 0;
	}
	h1 {
		font-size: clamp(1.8rem, 1vh + 2vw, 2.6rem);
	}
	h2 {
		font-size: 1.5rem;
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
		gap: 1.4rem;
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
	.stack {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: clamp(1.75rem, 4vh, 2.75rem);
		width: 100%;
	}
	.prize-row {
		display: flex;
		flex-wrap: wrap;
		gap: 20px;
		padding-top: 10px;
	}
	.prize-symbol {
		width: 108px;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 9px;
		text-align: center;
	}
	.prize-symbol:nth-child(odd) {
		transform: rotate(-3deg);
	}
	.prize-symbol:nth-child(even) {
		transform: rotate(3deg);
	}
	.icon-badge {
		position: relative;
		width: 96px;
		height: 96px;
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
	.tape-strip {
		position: absolute;
		top: -9px;
		left: 50%;
		transform: translateX(-50%) rotate(var(--tilt));
		width: calc(60px + var(--grow) * 3);
		height: calc(18px + var(--grow));
		background: var(--tape-bg);
	}
	.prize-name {
		font-family: var(--font-hand);
		font-weight: 700;
		font-size: 1rem;
	}
	fieldset {
		margin: 0;
		padding: 0;
		border: none;
	}
	.group {
		display: flex;
		flex-direction: column;
		gap: 0.9rem;
	}
	.group > legend {
		margin-bottom: 0.9rem;
		font-size: 1.05rem;
	}
	.group label {
		font-weight: 600;
		font-size: 0.85rem;
		color: var(--ink-soft);
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
	label,
	legend {
		font-weight: 700;
		font-size: 0.95rem;
		padding: 0;
	}
	.field > legend {
		margin-bottom: 0.35rem;
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
		line-height: 1.45;
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
	.sheet > .intro {
		margin-top: -0.9rem;
	}
	.page input[readonly] {
		color: #6b6b6b;
		background: #e4e4e4;
		border-color: #c4c4c4;
		user-select: none;
		pointer-events: none;
	}
	.warning {
		margin: 0;
		padding: 0.5rem 0.75rem;
		background:
			var(--grain) padding-box,
			linear-gradient(var(--note), var(--note)) padding-box,
			var(--pencil);
		border: 3px solid transparent;
		border-radius: 8px;
		font-weight: 600;
		line-height: 1.45;
		transform: rotate(-0.5deg);
	}
	.done {
		font-weight: 700;
	}
	.check {
		display: flex;
		align-items: flex-start;
		gap: 0.5rem;
		line-height: 1.45;
	}
	.page .check input {
		width: auto;
		margin-top: 0.2rem;
		accent-color: var(--accent);
	}
	.check input[aria-invalid='true'] {
		outline: 2px solid var(--accent);
	}
	.scale {
		display: grid;
		grid-template-columns: repeat(10, minmax(0, 1fr));
		gap: 0.4rem;
	}
	.score {
		position: relative;
	}
	.score input {
		position: absolute;
		opacity: 0;
		pointer-events: none;
	}
	.score span {
		display: flex;
		align-items: center;
		justify-content: center;
		aspect-ratio: 1;
		font-family: var(--font-hand);
		font-weight: 700;
		font-size: 1.05rem;
		background: var(--bg-2);
		border: 2px solid var(--line);
		border-radius: 10px 6px 9px 6px/6px 10px 6px 9px;
		transition:
			border-color 0.12s ease,
			transform 0.12s ease;
	}
	.score.wide {
		grid-column: span 2;
	}
	.score.wide span {
		aspect-ratio: auto;
		height: 100%;
		min-height: 2.5rem;
	}
	.score:hover span {
		border-color: var(--ink-soft);
	}
	.score.picked span {
		color: var(--accent-ink);
		background: var(--accent);
		border-color: var(--ink);
		transform: rotate(-3deg);
	}
	.score input:focus-visible + span {
		outline: 3px solid var(--accent);
		outline-offset: 2px;
	}
	.scale[aria-invalid='true'] .score span {
		border-color: var(--accent);
	}
	.page :global(:where(input:not([type='hidden'], [type='checkbox'], [type='radio']))),
	textarea {
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
	textarea {
		resize: vertical;
	}
	.page :global(input:focus),
	textarea:focus {
		border-color: var(--ink);
	}
	.page :global(input[aria-invalid='true']),
	textarea[aria-invalid='true'] {
		border-color: var(--accent);
	}
	@media (max-width: 560px) {
		.row {
			grid-template-columns: 1fr;
		}
		.scale {
			grid-template-columns: repeat(6, minmax(0, 1fr));
		}
	}
</style>
