<script lang="ts">
	import reeltop from '$lib/assets/reeltop.mp4';
	import reeltopThumb from '$lib/assets/reeltop_thumb.jpg';
	import reelmid from '$lib/assets/reelmid.mp4';
	import reelmidThumb from '$lib/assets/reelmid_thumb.jpg';
	import reelbot from '$lib/assets/reelbot.mp4';
	import reelbotThumb from '$lib/assets/reelbot_thumb.jpg';
	import tshirtimage from '$lib/assets/tshirtimage.png';
	import orpheusplushie from '$lib/assets/orpheusplushie.png';
	import heidisticker from '$lib/assets/heidisticker.webp';

	let { data } = $props();

	function formatCount(n: number) {
		if (n >= 1000) return `${Math.round(n / 1000)}k`;
		return String(n);
	}

	// The posters are frames pulled out of each video with ffmpeg.
	const reels = [
		{ src: reeltop, poster: reeltopThumb },
		{ src: reelmid, poster: reelmidThumb },
		{ src: reelbot, poster: reelbotThumb }
	];
	let reelIndex = $state(1);
	const prevIndex = $derived((reelIndex - 1 + reels.length) % reels.length);
	const nextIndex = $derived((reelIndex + 1) % reels.length);

	// Muted and paused to start: sound only ever arrives because someone asked for it. Swapping
	// reels resets both, so the next one can't inherit the last one's playhead or start itself.
	let paused = $state(true);
	let muted = $state(true);
	let currentTime = $state(0);
	let duration = $state(0);

	function showReel(index: number) {
		reelIndex = index;
		paused = true;
		currentTime = 0;
		duration = 0;
	}

	function nextReel() {
		showReel(nextIndex);
	}

	function prevReel() {
		showReel(prevIndex);
	}

	const prizeItems = [
		{ img: heidisticker, name: 'Stickers', label: '2-day prize' },
		{ img: tshirtimage, name: 'T-shirt', label: '7-day prize' },
		{ img: orpheusplushie, name: 'Plushie', label: '25-day prize' },
		{ img: null, name: '$500 fund', label: 'most-viewed creator' }
	];
	const prizeLoop = [...prizeItems, ...prizeItems];

	const reelIdeas = [
		'A 30 day series of learning piano from scratch',
		'A 30 day series of soldering your first PCB',
		'A 30 day series of drawing one portrait a day',
		'A 30 day series of learning to skateboard',
		'A 30 day series of building a game in Godot',
		'A 30 day series of cooking a new dish every night',
		'A 30 day series of running a mile before school',
		'A 30 day series of learning Japanese out loud',
		'A 30 day series of editing one video effect a day',
		'A 30 day series of making a 3D print that fixes something'
	];

	let ideaIndex = $state(0);

	const faqItems = [
		{
			q: 'What is the Day One Of Challenge?',
			a: 'A Hack Club YSWS (you-ship-we-ship) where you post a short-form video on YouTube Shorts, TikTok, or Instagram and earn prizes for keeping your streak alive.'
		},
		{
			q: 'What is Hack Club?',
			a: "We're a worldwide community of 100k+ teen hackers, and a nonprofit that funds programs like this one, plus hackathons and online social events all year round."
		},
		{
			q: 'What are the rules?',
			a: 'Learn or make anything you want. A series on learning piano, building hardware, or whatever you\'re already into all count. Just mention Hack Club somewhere in the video, like "This video is part of the Day One Of Challenge from Hack Club!", so we can verify it.'
		},
		{
			q: 'How do streaks and freezes work?',
			a: 'Post a video every day to keep your streak going. Your day ends at 1am your local time. Every 2 days you post, you bank a streak freeze, and a freeze automatically covers a day you miss. Run out of freezes and miss a day, and the streak breaks.'
		},
		{
			q: 'What prizes can I earn?',
			prizes: [
				{ mark: '2 days', text: '5 random Hack Club stickers' },
				{ mark: '7 days', text: 'a Hack Club t-shirt' },
				{ mark: '15 days', text: 'socks and an enamel pin' },
				{ mark: '25 days', text: 'a legendary Orpheus Plushie' }
			],
			note: 'The most-viewed creator overall also gets $500 towards their setup.'
		},
		{
			q: 'Anything else I should know?',
			a: "Please don't use generative AI anywhere in your videos. Prizes ship from Hack Club HQ, so if you're outside the USA, you're responsible for any customs fees your country charges."
		},
		{
			q: 'I have more questions!',
			contact: true
		}
	];

	function generateIdea() {
		if (reelIdeas.length <= 1) return;
		let next = Math.floor(Math.random() * reelIdeas.length);
		while (next === ideaIndex) {
			next = Math.floor(Math.random() * reelIdeas.length);
		}
		ideaIndex = next;
	}
</script>

<svelte:head>
	<title>Day One Of</title>
</svelte:head>

<div class="day-one">
	<div class="page">
		<div class="topbar">
			<span class="badge torn-tape">a Hack Club YSWS</span>
		</div>

		<main>
			<section class="hero">
				<div class="hero-copy">
					<h1>Day one of <em>anything</em> you want.</h1>
					<svg class="wavy" viewBox="0 0 240 10" preserveAspectRatio="none" aria-hidden="true">
						<path d="M2 6 Q 30 -1, 60 6 T 118 6 T 176 6 T 234 6" />
					</svg>
					<p class="sub">
						Most people spend too much time scrolling. Post content instead, and get prizes for it.
					</p>
					<p class="desc">
						Post a shortform video every day for a month, about anything at all. Get feedback from
						others to improve your content every day.
					</p>

					<form class="signup" action="/api/auth/login" method="GET">
						<input
							type="email"
							name="email"
							placeholder="you@school.edu"
							required
							aria-label="Email address"
						/>
						<button type="submit">Start day one</button>
						<svg class="cta-arrow" viewBox="0 0 52 34" aria-hidden="true">
							<path d="M4 4 Q 20 2, 30 16 Q 34 22, 44 24" />
							<path d="M35 20 L45 25 L38 30" />
						</svg>
					</form>
				</div>

				<div class="reel-stack">
					<button type="button" class="reel-card back-a" onclick={nextReel} aria-label="Play the next reel">
						<span class="screen">
							<img src={reels[nextIndex].poster} alt="" />
						</span>
					</button>
					<button
						type="button"
						class="reel-card back-b"
						onclick={prevReel}
						aria-label="Play the previous reel"
					>
						<span class="screen">
							<img src={reels[prevIndex].poster} alt="" />
						</span>
					</button>
					<div class="reel-card front">
						<div class="screen">
							{#key reelIndex}
								<!-- svelte-ignore a11y_media_has_caption -->
								<video
									bind:paused
									bind:muted
									bind:currentTime
									bind:duration
									src={reels[reelIndex].src}
									poster={reels[reelIndex].poster}
									loop
									playsinline
									preload="metadata"
								></video>
							{/key}
							{#if !paused}
								<span class="playing-badge"><span class="blip"></span>playing</span>
							{/if}

							<div class="reel-bar">
								<button
									class="reel-btn"
									type="button"
									onclick={() => (paused = !paused)}
									aria-label={paused ? 'Play reel' : 'Pause reel'}
								>
									{#if paused}
										<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5l11 7-11 7z" /></svg>
									{:else}
										<svg viewBox="0 0 24 24" aria-hidden="true"
											><path d="M8 5h3v14H8zm5 0h3v14h-3z" /></svg
										>
									{/if}
								</button>

								<!-- Inert until the metadata lands, since a range whose max is still 0 can only
								     pretend to scrub. duration is NaN before then, hence the `|| 0`. -->
								<input
									class="reel-scrub"
									type="range"
									min="0"
									max={duration || 0}
									step="0.05"
									disabled={!duration}
									bind:value={currentTime}
									aria-label="Skip through reel"
								/>

								<button
									class="reel-btn"
									type="button"
									onclick={() => (muted = !muted)}
									aria-label={muted ? 'Unmute reel' : 'Mute reel'}
								>
									<svg viewBox="0 0 24 24" aria-hidden="true">
										<path d="M4 9.5h3.5L12 6v12L7.5 14.5H4z" />
										{#if muted}
											<path d="M16 9.5l5 5m0-5l-5 5" fill="none" />
										{:else}
											<path d="M16 9a4.5 4.5 0 0 1 0 6" fill="none" />
										{/if}
									</svg>
								</button>
							</div>
						</div>
					</div>
				</div>
			</section>

			<section>
				<h2 class="eyebrow">Need a reel idea?</h2>
				<div class="idea-box">
					{#key ideaIndex}
						<p class="idea-text">
							<span class="mark" aria-hidden="true">&gt;</span>
							<span class="idea-line">{reelIdeas[ideaIndex]}</span>
						</p>
					{/key}
					<button class="roll-btn" type="button" onclick={generateIdea}>Generate idea</button>
				</div>
			</section>

			<section>
				<div class="prizes-and-stats">
					<div class="prize-block">
						<h2 class="eyebrow">You could get:</h2>
						<div class="prize-viewport">
							<div class="prize-cluster">
								{#each prizeLoop as prize, i}
									<div class="prize-symbol" aria-hidden={i >= prizeItems.length}>
										<span class="icon-badge">
											<span class="tape-strip torn-tape"></span>
											{#if prize.img}
												<img src={prize.img} alt="" />
											{:else}
												<svg viewBox="0 0 24 24">
													<circle cx="12" cy="12" r="9" />
													<text x="12" y="16" font-size="10" text-anchor="middle">$</text>
												</svg>
											{/if}
										</span>
										<span class="prize-name">{prize.name}</span>
										<span class="prize-day">{prize.label}</span>
									</div>
								{/each}
							</div>
						</div>
					</div>

					<div class="stats-wrap">
						<div class="receipt">
							<p class="receipt-title">So far…</p>
							<div class="stat-line">
								<span>total views</span><span class="num">{formatCount(data.totalViews)}</span>
							</div>
							<div class="stat-line">
								<span>most viewed reel</span><span class="num">{formatCount(data.mostViewedVideo)}</span>
							</div>
							<div class="stat-line">
								<span>participants</span><span class="num">{data.participants}</span>
							</div>
						</div>
					</div>

					<div class="sticky-note">
						<svg class="pin" viewBox="0 0 24 34" aria-hidden="true">
							<line class="pin-needle" x1="12" y1="19" x2="12" y2="32" />
							<path class="pin-body" d="M9 8 L10 15 L14 15 L15 8 Z" />
							<ellipse class="pin-body" cx="12" cy="16.5" rx="7" ry="2.5" />
							<rect class="pin-body" x="5.5" y="2" width="13" height="6.5" rx="3.25" />
							<line class="pin-shine" x1="8.5" y1="4.2" x2="12" y2="4.2" />
						</svg>
						<p class="receipt-title">How it works</p>
						<ol class="steps">
							<li>Sign in with your email</li>
							<li>Post a short-form video every day and mention Hack Club</li>
							<li>Drop the link in #dayoneof on Slack</li>
							<li>Keep your streak alive to unlock prizes</li>
						</ol>
					</div>
				</div>
			</section>

			<section class="faq-and-board">
				<div class="faq-col">
					<h2 class="eyebrow">Got questions?</h2>
					<div class="accordion">
						{#each faqItems as item}
							<details class="faq-item">
								<summary>
									<span>{item.q}</span>
									<svg class="chevron-icon" viewBox="0 0 24 24" aria-hidden="true">
										<path d="M6 9l6 6 6-6" />
									</svg>
								</summary>
								<div class="faq-body">
									{#if item.prizes}
										<ul class="prize-list">
											{#each item.prizes as row}
												<li class="prize-row">
													<span class="prize-mark">{row.mark}</span>
													<span>{row.text}</span>
												</li>
											{/each}
										</ul>
										<p class="faq-note"><strong>Grand prize:</strong> {item.note}</p>
									{:else if item.contact}
										<p>
											Reach out at <a href="mailto:darshg321@gmail.com">darshg321@gmail.com</a>,
											message
											<a
												href="https://hackclub.enterprise.slack.com/team/U0795SNGE9L"
												target="_blank"
												rel="noopener">@darsh</a
											>, or drop a note in
											<a
												href="https://hackclub.enterprise.slack.com/archives/C0C2U1ANNP7"
												target="_blank"
												rel="noopener">#dayoneof</a
											> on the Hack Club Slack.
										</p>
									{:else}
										<p>{item.a}</p>
									{/if}
								</div>
							</details>
						{/each}
					</div>
				</div>

				<aside class="receipt board">
					<p class="receipt-title">Leaderboard</p>
					<ol class="rows">
						{#each data.leaderboard as person, i}
							<li class="stat-line">
								<span class="rank">{i + 1}</span>
								{#if person.slackId}
									<a class="row-name" href="/user/{person.slackId}">{person.name}</a>
								{:else}
									<span class="row-name">{person.name}</span>
								{/if}
								<span class="num">{person.streak}d</span>
							</li>
						{:else}
							<li class="empty-row">Nobody's started a streak yet. Be the first!</li>
						{/each}
					</ol>
				</aside>
			</section>
		</main>

		<footer>
			<span>made for <strong>hack clubbers</strong>, one reel a day.</span>
			<nav class="footer-links" aria-label="Hack Club">
				<a href="https://hackclub.com" target="_blank" rel="noopener">hack club</a>
				<span aria-hidden="true">·</span>
				<a href="https://slack.hackclub.com" target="_blank" rel="noopener">slack</a>
				<span aria-hidden="true">·</span>
				<a href="https://clubs.hackclub.com" target="_blank" rel="noopener">clubs</a>
				<span aria-hidden="true">·</span>
				<a href="https://hackathons.hackclub.com" target="_blank" rel="noopener">hackathons</a>
			</nav>
		</footer>
	</div>
</div>

<style>
	.page {
		max-width: 1240px;
		margin-inline: auto;
		padding: 28px 20px 60px;
	}

	h1,
	h2 {
		font-family: 'Shantell Sans', 'Comic Sans MS', cursive;
		font-weight: 600;
		margin: 0;
		text-wrap: balance;
	}

	p {
		margin: 0;
	}

	button {
		font: inherit;
		color: inherit;
		background: none;
		border: none;
		padding: 0;
		text-align: inherit;
	}

	.wavy {
		display: block;
		width: 100%;
		height: 10px;
		overflow: visible;
	}

	.wavy path {
		fill: none;
		stroke: var(--accent);
		stroke-width: 3;
		stroke-linecap: round;
	}

	.torn-tape {
		position: relative;
		clip-path: polygon(
			3px 0,
			calc(100% - 3px) 0,
			100% 28%,
			calc(100% - 3px) 58%,
			100% 100%,
			3px 100%,
			0 58%,
			3px 28%
		);
		background-image: repeating-linear-gradient(
			48deg,
			rgba(255, 255, 255, 0.32) 0 2px,
			transparent 2px 7px
		);
		background-blend-mode: overlay;
		box-shadow: 1px 3px 0 rgba(43, 34, 22, 0.18);
	}

	.topbar {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		margin-bottom: 38px;
	}

	.badge {
		font-size: 0.75rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		background-color: var(--bg-2);
		border: 1.5px solid var(--line);
		color: var(--ink-soft);
		padding: 6px 12px;
		border-radius: 999px;
		transform: rotate(-2deg);
	}

	.hero {
		display: grid;
		grid-template-columns: 1.05fr 0.95fr;
		gap: 40px;
		align-items: start;
		margin-bottom: 56px;
	}

	.hero-copy h1 {
		font-size: clamp(2.6rem, 4vw + 1.4rem, 4.6rem);
		line-height: 1.05;
	}

	.hero-copy h1 em {
		font-style: normal;
		color: var(--accent);
	}

	.sub {
		margin-top: 18px;
		font-size: 1.3rem;
		font-weight: 600;
		max-width: 34ch;
	}

	.desc {
		margin-top: 12px;
		font-size: 1.1rem;
		color: var(--ink-soft);
		max-width: 40ch;
		line-height: 1.5;
	}

	.signup {
		margin-top: 26px;
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		position: relative;
	}

	.signup input {
		font: inherit;
		font-size: 0.95rem;
		padding: 13px 16px;
		border: 2px solid var(--ink);
		border-radius: 10px;
		background: var(--bg-2);
		color: var(--ink);
		flex: 1 1 220px;
		min-width: 0;
	}

	.signup input:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 1px;
	}

	.signup button,
	.roll-btn {
		font-weight: 700;
		font-size: 0.95rem;
		border-radius: 10px;
		border: 2px solid var(--ink);
		cursor: var(--cursor-pointer);
		white-space: nowrap;
		transition:
			transform 0.12s ease,
			box-shadow 0.12s ease;
	}

	.signup button {
		padding: 13px 22px;
		background: var(--accent);
		color: var(--accent-ink);
		box-shadow: 3px 3px 0 var(--ink);
	}

	.signup button:hover {
		transform: translate(-2px, -2px);
		box-shadow: 5px 5px 0 var(--ink);
	}

	.signup button:active {
		transform: translate(0, 0);
		box-shadow: 1px 1px 0 var(--ink);
	}

	.cta-arrow {
		position: absolute;
		top: -30px;
		left: 225px;
		width: 52px;
		height: 34px;
		pointer-events: none;
	}

	.cta-arrow path {
		fill: none;
		stroke: var(--accent);
		stroke-width: 2.2;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.reel-stack {
		position: relative;
		height: 580px;
		display: flex;
		align-items: center;
		justify-content: center;
	}

	.reel-card {
		position: absolute;
		display: block;
		background: var(--bg-2);
		border: 2px solid var(--ink);
		border-radius: 15px 8px 12px 9px/9px 13px 8px 15px;
		padding: 10px 10px 34px;
		box-shadow: 5px 6px 0 var(--shadow);
		transition:
			transform 0.22s ease,
			box-shadow 0.22s ease;
	}

	.reel-card.front {
		width: 290px;
		z-index: 2;
		transform: rotate(-2deg);
	}

	.reel-card.back-a,
	.reel-card.back-b {
		width: 205px;
		cursor: var(--cursor-pointer);
		z-index: 1;
	}

	.reel-card.back-a {
		top: 28px;
		right: 6px;
		transform: rotate(9deg);
	}

	.reel-card.back-b {
		bottom: 0;
		left: 6px;
		transform: rotate(-8deg);
	}

	.reel-card.back-a:hover,
	.reel-card.back-a:focus-visible {
		transform: rotate(7deg) translateY(-6px);
		box-shadow: 7px 8px 0 var(--shadow);
	}

	.reel-card.back-b:hover,
	.reel-card.back-b:focus-visible {
		transform: rotate(-6deg) translateY(-6px);
		box-shadow: 7px 8px 0 var(--shadow);
	}

	.reel-card.back-a:focus-visible,
	.reel-card.back-b:focus-visible {
		outline: 3px solid var(--accent);
		outline-offset: 3px;
	}

	.screen {
		display: block;
		width: 100%;
		aspect-ratio: 9 / 16;
		border-radius: 8px;
		background: linear-gradient(160deg, var(--bg) 0%, var(--bg-2) 100%);
		border: 1.5px solid var(--line);
		position: relative;
		overflow: hidden;
	}

	.screen img,
	.screen video {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.playing-badge {
		position: absolute;
		top: 7px;
		right: 7px;
		background: var(--accent);
		color: var(--accent-ink);
		font-size: 0.6rem;
		font-weight: 800;
		letter-spacing: 0.03em;
		text-transform: uppercase;
		padding: 4px 8px 4px 6px;
		border-radius: 999px;
		display: flex;
		align-items: center;
		gap: 4px;
		z-index: 1;
	}

	.blip {
		width: 6px;
		height: 6px;
		border-radius: 50%;
		background: var(--accent-ink);
		animation: blip 1.4s ease-in-out infinite;
	}

	@keyframes blip {
		0%,
		100% {
			opacity: 1;
		}
		50% {
			opacity: 0.35;
		}
	}

	.reel-bar {
		position: absolute;
		bottom: 8px;
		left: 8px;
		right: 8px;
		display: flex;
		align-items: center;
		gap: 6px;
		padding: 4px 6px;
		background: var(--bg-2);
		border: 1px solid var(--line);
		border-radius: 6px;
	}

	.reel-btn {
		flex: 0 0 auto;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: 50%;
		color: var(--ink);
		cursor: var(--cursor-pointer);
	}

	.reel-btn:hover {
		color: var(--accent);
	}

	.reel-btn svg {
		width: 0.95rem;
		height: 0.95rem;
		fill: currentColor;
		stroke: currentColor;
		stroke-width: 1.7;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	/* A bare range input, restyled rather than replaced: dragging, arrow keys and the whole
	   click-anywhere-on-the-track behaviour come free that way. */
	.reel-scrub {
		flex: 1 1 auto;
		min-width: 0;
		height: 1rem;
		margin: 0;
		appearance: none;
		background: none;
		cursor: var(--cursor-pointer);
	}

	.reel-scrub:disabled {
		cursor: var(--cursor);
		opacity: 0.55;
	}

	.reel-scrub::-webkit-slider-runnable-track {
		height: 3px;
		border-radius: 2px;
		background: var(--line);
	}

	.reel-scrub::-moz-range-track {
		height: 3px;
		border-radius: 2px;
		background: var(--line);
	}

	.reel-scrub::-webkit-slider-thumb {
		appearance: none;
		width: 10px;
		height: 10px;
		margin-top: -3.5px;
		border-radius: 50%;
		background: var(--accent);
	}

	.reel-scrub::-moz-range-thumb {
		width: 10px;
		height: 10px;
		border: none;
		border-radius: 50%;
		background: var(--accent);
	}

	.reel-btn:focus-visible,
	.reel-scrub:focus-visible {
		outline: 2px solid var(--accent);
		outline-offset: 2px;
	}

	section {
		margin-bottom: 50px;
	}

	.eyebrow {
		font-weight: 700;
		font-size: 1.5rem;
		margin-bottom: 18px;
		display: inline-block;
		text-decoration: underline wavy var(--accent) 2px;
		text-underline-offset: 7px;
	}

	.idea-box,
	.faq-item {
		background: var(--bg-2);
		border: 2px solid var(--ink);
		border-radius: 22px 10px 18px 12px/12px 20px 10px 24px;
		box-shadow: 4px 5px 0 var(--shadow);
	}

	.idea-box {
		padding: 24px 26px;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 20px;
		flex-wrap: wrap;
	}

	.idea-text {
		display: flex;
		gap: 10px;
		align-items: baseline;
		font-size: 1.05rem;
		max-width: 44ch;
		animation: fade-in 0.15s ease;
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	.mark {
		color: var(--accent);
		font-family: 'Shantell Sans', cursive;
		font-weight: 700;
		font-size: 1.2rem;
	}

	.idea-line {
		font-weight: 600;
	}

	.roll-btn {
		padding: 12px 20px;
		background: var(--ink);
		color: var(--bg);
		box-shadow: 3px 3px 0 var(--accent);
	}

	.roll-btn:hover {
		transform: translate(-2px, -2px);
		box-shadow: 5px 5px 0 var(--accent);
	}

	.roll-btn:active {
		transform: translate(0, 0);
		box-shadow: 1px 1px 0 var(--accent);
	}

	.prizes-and-stats {
		display: flex;
		gap: 24px;
		flex-wrap: wrap;
		align-items: center;
	}

	.prize-block {
		flex: 1 1 400px;
		min-width: 0;
	}

	.prize-viewport {
		overflow: hidden;
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

	.prize-block:hover .prize-cluster {
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
		width: 150px;
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
		width: 128px;
		height: 128px;
		border-radius: 50%;
		border: 2.5px solid var(--ink);
		background: var(--bg-2);
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

	.icon-badge svg {
		width: 52%;
		height: 52%;
	}

	.icon-badge svg circle {
		stroke: var(--accent);
		stroke-width: 2;
		fill: none;
	}

	.icon-badge svg text {
		fill: var(--accent);
		font-family: 'Shantell Sans', cursive;
		font-weight: 700;
	}

	.tape-strip {
		position: absolute;
		top: -9px;
		left: 50%;
		transform: translateX(-50%) rotate(-4deg);
		width: 52px;
		height: 18px;
		background-color: var(--tape);
		opacity: 0.9;
	}

	.prize-symbol:nth-child(even) .tape-strip {
		background-color: var(--tape-2);
		transform: translateX(-50%) rotate(4deg);
	}

	.prize-name {
		font-family: 'Shantell Sans', cursive;
		font-weight: 700;
		font-size: 1.05rem;
	}

	.prize-day {
		font-size: 0.82rem;
		color: var(--ink-soft);
	}

	.stats-wrap {
		display: flex;
		flex: 0 0 270px;
		max-width: 100%;
	}

	.sticky-note {
		position: relative;
		flex: 0 0 260px;
		max-width: 100%;
		aspect-ratio: 1 / 1;
		background: var(--note);
		border: 2px solid var(--ink);
		border-radius: 4px 10px 6px 12px/10px 4px 12px 6px;
		padding: 24px 20px 18px;
		transform: rotate(1.5deg);
		box-shadow: 4px 5px 0 var(--shadow);
	}

	.pin {
		position: absolute;
		top: -24px;
		left: 50%;
		width: 26px;
		height: 37px;
		transform: translateX(-50%) rotate(14deg);
		filter: drop-shadow(2px 3px 0 var(--shadow));
		overflow: visible;
	}

	.pin-body {
		fill: var(--accent);
		stroke: var(--ink);
		stroke-width: 1.5;
		stroke-linejoin: round;
	}

	.pin-needle {
		stroke: var(--ink-soft);
		stroke-width: 1.6;
		stroke-linecap: round;
	}

	.pin-shine {
		stroke: #f8b3ab;
		stroke-width: 1.4;
		stroke-linecap: round;
	}

	.steps {
		margin: 0;
		padding: 0;
		list-style: none;
		counter-reset: step;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}

	.steps li {
		counter-increment: step;
		display: flex;
		gap: 10px;
		align-items: baseline;
		font-size: 0.95rem;
		line-height: 1.4;
	}

	.steps li::before {
		content: counter(step);
		flex: 0 0 auto;
		font-family: 'Shantell Sans', cursive;
		font-weight: 700;
		font-size: 1.1rem;
		color: var(--accent);
	}

	.receipt {
		background: var(--bg-2);
		border: 2px solid var(--ink);
		border-radius: 12px 6px 10px 6px/6px 12px 6px 10px;
		padding: 20px 24px;
		width: 100%;
		max-width: 270px;
		transform: rotate(-0.8deg);
		box-shadow: 4px 5px 0 var(--shadow);
	}

	.receipt-title {
		font-family: 'Shantell Sans', cursive;
		font-weight: 700;
		font-size: 1.15rem;
		margin-bottom: 14px;
	}

	.stat-line {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 10px;
		padding-block: 9px;
		border-top: 1px dashed var(--line);
		font-size: 0.95rem;
	}

	.receipt-title + .stat-line,
	.stat-line:first-child {
		border-top: none;
	}

	.num {
		font-variant-numeric: tabular-nums;
		font-weight: 800;
		background: var(--accent);
		color: var(--accent-ink);
		padding: 3px 10px;
		border-radius: 999px;
		font-size: 0.9rem;
	}

	.faq-and-board {
		display: grid;
		grid-template-columns: 1fr 320px;
		gap: 40px;
		align-items: start;
	}

	.accordion {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}

	.faq-item summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		list-style: none;
		cursor: var(--cursor-pointer);
		padding: 16px 22px;
		font-weight: 700;
	}

	.faq-item summary::-webkit-details-marker {
		display: none;
	}

	.faq-item summary:hover {
		color: var(--accent);
	}

	.chevron-icon {
		flex: 0 0 auto;
		width: 1.1rem;
		height: 1.1rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 2.5;
		stroke-linecap: round;
		stroke-linejoin: round;
		transition: transform 0.15s ease;
	}

	.faq-item[open] .chevron-icon {
		transform: rotate(180deg);
	}

	.faq-body {
		padding: 0 22px 18px;
		color: var(--ink-soft);
		line-height: 1.55;
	}

	.faq-body a {
		color: var(--accent);
		font-weight: 600;
	}

	.prize-list {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}

	.prize-row {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.prize-mark {
		flex: 0 0 4.25rem;
		font-family: 'Shantell Sans', cursive;
		font-weight: 700;
		color: var(--ink);
	}

	.faq-note {
		margin-top: 12px;
	}

	.faq-note strong {
		color: var(--accent);
	}

	.board {
		max-width: none;
		transform: rotate(0.8deg);
	}

	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
	}

	.rank {
		flex: 0 0 auto;
		width: 1.6rem;
		font-family: 'Shantell Sans', cursive;
		font-weight: 700;
		color: var(--ink-soft);
		font-variant-numeric: tabular-nums;
	}

	.row-name {
		flex: 1 1 auto;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 600;
		color: var(--ink);
		text-decoration: none;
	}

	a.row-name:hover {
		color: var(--accent);
	}

	.empty-row {
		color: var(--ink-soft);
		font-size: 0.95rem;
	}

	footer {
		display: flex;
		justify-content: space-between;
		align-items: center;
		flex-wrap: wrap;
		gap: 10px;
		padding-top: 20px;
		border-top: 2px solid var(--line);
		color: var(--ink-soft);
		font-size: 0.85rem;
	}

	footer strong {
		color: var(--ink);
		font-family: 'Shantell Sans', cursive;
	}

	.footer-links {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}

	.footer-links a {
		color: inherit;
		text-decoration: none;
	}

	.footer-links a:hover {
		color: var(--accent);
	}

	@media (max-width: 760px) {
		.hero,
		.faq-and-board {
			grid-template-columns: 1fr;
		}
	}

	@media (max-width: 520px) {
		.cta-arrow {
			display: none;
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.blip,
		.prize-cluster,
		.idea-text {
			animation: none;
		}

		.prize-viewport {
			overflow-x: auto;
		}
	}
</style>
