<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { HELP_URL } from '$lib/help';

	let { data, form } = $props();

	const SCORES = Array.from({ length: 10 }, (_, i) => String(i + 1));

	const initial = untrack(() => form?.values ?? data.saved);

	let score = $state(initial?.score ?? '');
	let heardFrom = $state(initial?.heardFrom ?? '');
	let doingWell = $state(initial?.doingWell ?? '');
	let doBetter = $state(initial?.doBetter ?? '');
	let email = $state(initial?.email ?? '');
	let otherFeedback = $state(initial?.otherFeedback ?? '');
	let anonymous = $state(false);
	let submitting = $state(false);
	let attempted = $state(false);

	const clientErrors = $derived({
		...(score ? {} : { score: 'Pick a number from 1 to 10.' }),
		...(heardFrom.trim() ? {} : { heardFrom: 'Tell us where you heard about it.' })
	} as Record<string, string>);
	const errors: Record<string, string> = $derived(attempted ? clientErrors : (form?.errors ?? {}));
</script>

<svelte:head>
	<title>Feedback · Day One Of</title>
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
		<div class="sheet">
			<h1>How's Day One Of going?</h1>
			<p>Can you give us feedback on Day One Of? We read every answer and use it to make the program better.</p>
			<p>Thank you! Please answer in your own words.</p>

			{#if form?.success}
				<p class="done">Thanks for the feedback!</p>
				<a class="submit" href="/home">Back to home</a>
			{:else}
				{#if data.saved?.submitted}
					<p class="hint">You've already answered. Submitting again replaces your answers.</p>
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
						<p class="hint">
							Be as specific as possible. If you heard about it in a Slack channel, which one? If someone
							told you, who? Ex. "My friend told me about it in #lounge"
						</p>
						<input id="heardFrom" name="heardFrom" aria-invalid={!!errors.heardFrom} bind:value={heardFrom} />
						{#if errors.heardFrom}<p class="error">{errors.heardFrom}</p>{/if}
					</div>

					<div class="field">
						<label for="doingWell">What's Day One Of doing well?</label>
						<textarea id="doingWell" name="doingWell" rows="3" bind:value={doingWell}></textarea>
					</div>

					<div class="field">
						<label for="doBetter">What could Day One Of be doing better?</label>
						<textarea id="doBetter" name="doBetter" rows="3" bind:value={doBetter}></textarea>
					</div>

					<div class="field">
						<label for="email">Email <span class="optional">(Optional)</span></label>
						<p class="hint">So we can reach out if we have more questions</p>
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
						<label for="otherFeedback">Any other feedback? <span class="optional">(Optional)</span></label>
						<textarea id="otherFeedback" name="otherFeedback" rows="4" bind:value={otherFeedback}></textarea>
					</div>

					<input class="trap" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" />

					{#if data.session}
						<label class="check">
							<input type="checkbox" name="anonymous" bind:checked={anonymous} />
							Keep this anonymous
						</label>
						<p class="hint">
							{anonymous
								? "We won't know it's from you."
								: "You're signed in, so it's linked to your streak and you can change your answers later."}
						</p>
					{:else}
						<p class="hint">
							This is anonymous. <a href="/api/auth/login?next=/feedbackform">Sign in</a> if you'd like it
							linked to your streak.
						</p>
					{/if}

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
				</form>
			{/if}
		</div>
	</main>
</div>

<style>
	.page {
		--frame: clamp(1rem, 2.6vw, 3.25rem);
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
	form {
		display: flex;
		flex-direction: column;
		gap: 1.4rem;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		min-width: 0;
		margin: 0;
		padding: 0;
		border: none;
	}
	label,
	legend {
		font-weight: 700;
		font-size: 0.95rem;
		padding: 0;
	}
	legend {
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
	.trap {
		position: absolute;
		left: -9999px;
		width: 1px;
		height: 1px;
		opacity: 0;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}
	.check input {
		width: auto;
		accent-color: var(--accent);
	}
	.done {
		font-weight: 700;
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
	input,
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
	input:focus,
	textarea:focus {
		border-color: var(--ink);
	}
	input[aria-invalid='true'] {
		border-color: var(--accent);
	}
	@media (max-width: 460px) {
		.scale {
			grid-template-columns: repeat(5, minmax(0, 1fr));
		}
	}
</style>
