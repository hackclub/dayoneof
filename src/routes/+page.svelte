<script lang="ts">
	import reeltop from '$lib/assets/reeltop.mp4';
	import reeltopThumb from '$lib/assets/reeltop_thumb.jpg';
	import reelmid from '$lib/assets/reelmid.mp4';
	import reelmidThumb from '$lib/assets/reelmid_thumb.jpg';
	import reelbot from '$lib/assets/reelbot.mp4';
	import reelbotThumb from '$lib/assets/reelbot_thumb.jpg';
	import tshirtimage from '$lib/assets/tshirtimage.webp';
	import orpheusplushie from '$lib/assets/orpheusplushie.webp';
	import socks from '$lib/assets/socks.webp';
	import heidisticker from '$lib/assets/heidisticker.webp';
	import sticker2 from '$lib/assets/sticker2.webp';
	import wordmark from '$lib/assets/wordmark.webp';
	import { sprite, tape } from '$lib/asset_sheet';
	import { page } from '$app/state';

	let { data } = $props();

	const description =
		'Post a short-form video every day for a month and earn free prizes. A Hack Club challenge for teens 13–18.';
	const structuredData = $derived({
		'@context': 'https://schema.org',
		'@type': 'WebSite',
		name: 'Day One Of',
		url: `${page.url.origin}/`,
		description,
		publisher: { '@type': 'Organization', name: 'Hack Club', url: 'https://hackclub.com' }
	});

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
		{ img: socks, name: 'Socks + pin', label: '15-day prize' },
		{ img: orpheusplushie, name: 'Plushie', label: '25-day prize' },
		{ img: null, name: '$500 fund', label: 'most-viewed creator' }
	];
	const prizeLoop = [...prizeItems, ...prizeItems];

	const reelIdeas = [
		'Day one of learning piano from scratch',
		'Day one of learning to solder your first PCB',
		'Day one of learning to draw portraits',
		'Day one of learning to skateboard',
		'Day one of learning to build a game in Godot',
		'Day one of learning to cook',
		'Day one of learning to run a mile',
		'Day one of learning Japanese out loud',
		'Day one of learning video editing one effect at a time',
		'Day one of learning 3D printing by fixing things around the house',
		'Day one of learning to fix every squeaky door in my house',
		'Day one of learning to build a mechanical keyboard from parts',
		'Day one of learning to film cinematic shots on my phone',
		'Day one of learning to code a Discord bot for my friends',
		'Day one of learning latte art with a cheap milk frother',
		'Day one of learning to repair old electronics from the thrift store',
		'Day one of learning to grow vegetables on my windowsill',
		'Day one of learning to solve a Rubik\'s cube under a minute',
		'Day one of learning to make a soundtrack for an indie game',
		'Day one of learning to bind a notebook by hand'
	];

	const milestonePrizes = [
		{ mark: '2 days', text: '5 random Hack Club stickers' },
		{ mark: '7 days', text: 'a Hack Club t-shirt' },
		{ mark: '15 days', text: 'a pair of Hack Club socks and a Hack Club enamel pin' },
		{ mark: '25 days', text: 'one of the very rare Orpheus plushies' }
	];

	let ideaIndex = $state(0);
	let scrollY = $state(0);

	const faqItems = [
		{
			q: 'What is Day One Of?',
			a: "A Hack Club YSWS (you-ship-we-ship) where you post a short-form video every day on YouTube Shorts, TikTok, or Instagram and earn prizes for keeping your streak alive. Hack Club is a 501(c)(3) nonprofit and a worldwide community of 100k+ teen hackers that's been running programs like this for years, including Arcade, High Seas, and Summer of Making."
		},
		{
			q: 'Who can join, and does it cost anything?',
			a: "Any teen aged 13–18 with a verified Hack Club account, which signing in checks for you. It's 100% free: every prize is paid for by Hack Club and ships from Hack Club HQ. If you live outside the USA, you're responsible for any customs fees your country charges."
		},
		{
			q: 'What are the rules?',
			a: 'Learn or make anything you want, like learning piano, building hardware, or whatever you\'re already into. Videos must be at least 15 seconds long, published in the last day, and mention Hack Club somewhere, like "This video is part of the Day One Of Challenge from Hack Club!", so we can verify you made it. Please don\'t use generative AI anywhere in your videos.'
		},
		{
			q: 'How do streaks and freezes work?',
			a: "Your streak is how many days in a row you've posted. Your day ends at 3am your local time, so a video posted at 2am still counts for the day before, and posting twice in one day doesn't add an extra day. For every 2 days you post, you earn a streak freeze, and you can hold up to 3. If a day ends without a post, a freeze is used automatically so your streak survives, but frozen days don't add to it. Miss a day with no freezes left and your streak goes back to 0."
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
	<meta name="description" content={description} />
	<link rel="canonical" href="{page.url.origin}/" />
	<meta property="og:type" content="website" />
	<meta property="og:url" content="{page.url.origin}/" />
	<meta property="og:title" content="Day One Of" />
	<meta property="og:description" content={description} />
	<meta property="og:image" content="{page.url.origin}/og-image.png" />
	<meta property="og:image:alt" content="Day One Of logo" />
	<meta name="twitter:card" content="summary" />
	<meta name="twitter:title" content="Day One Of" />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content="{page.url.origin}/og-image.png" />
	{@html `<script type="application/ld+json">${JSON.stringify(structuredData)}</script>`}
</svelte:head>

<svelte:window bind:scrollY />

<div class="day-one">
	<span class="scroll-hint" class:hidden={scrollY > 40} style={sprite('chevron_down')} aria-hidden="true"
	></span>
	<div class="page">
		<div class="topbar">
			<a class="flag" href="https://hackclub.com/"><img src="/flag-orpheus-top.svg" alt="Hack Club" width="180" height="102" /></a>
		</div>

		<main>
			<section class="hero">
				<div class="hero-copy">
					<h1 class="wordmark">
						<img src={wordmark} alt="Day one of anything you want." width="349" height="251" fetchpriority="high" />
					</h1>
					<p class="sub">
						Most people spend too much time scrolling. Post content instead, and get prizes for it.
					</p>
					<p class="desc">
						Post a shortform video every day for a month, about anything at all. Get feedback from
						others to improve your content every day, and earn bonus stickers for giving feedback on
						theirs.
					</p>

					<form class="signup" action="/api/auth/login" method="GET">
						<input
							type="email"
							name="email"
							placeholder="you@example.com"
							required
							aria-label="Email address"
						/>
						<button type="submit">Start day one</button>
					</form>
					<p class="signup-note">
						{#if !data.submissionsOpen}
							<strong>The program launches at 200 sign-ups!</strong>
						{/if}
						Not on the Hack Club Slack yet?
						<a href="https://slack.hackclub.com" target="_blank" rel="noopener">Join the Slack today</a>.
					</p>
					<p class="signup-note">
						By <a href="https://hackclub.com" target="_blank" rel="noopener">Hack Club</a>, for teens
						13–18. Run by
						<a href="https://hackclub.enterprise.slack.com/team/U0795SNGE9L" target="_blank" rel="noopener"
							>@Darsh</a
						>,
						<a href="https://hackclub.enterprise.slack.com/team/U0793HPEX6V" target="_blank" rel="noopener"
							>@Celestial</a
						>, and
						<a href="https://hackclub.enterprise.slack.com/team/U09UE480JHH" target="_blank" rel="noopener"
							>@Zach Latta</a
						>.
					</p>
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
									<span class="reel-icon" style={sprite(paused ? 'badge_play' : 'badge_pause')}></span>
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

			<section class="tight">
				<div class="prizes-and-stats">
					<div class="prize-block">
						<h2 class="eyebrow">You could get:</h2>
						<div class="prize-viewport">
							<div class="prize-cluster">
								{#each prizeLoop as prize, i}
									<div class="prize-symbol" aria-hidden={i >= prizeItems.length}>
										<span class="icon-badge">
											<span class="tape-strip" style={tape('prize', i % prizeItems.length)}></span>
											{#if prize.img}
												<img src={prize.img} alt="" loading="lazy" decoding="async" />
											{:else}
												<span class="dollar" style={sprite('badge_dollar')}></span>
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
								<span>total views</span><span class="num taped" style={tape('receipt', 0)}>{formatCount(data.totalViews)}</span>
							</div>
							<div class="stat-line">
								<span>most viewed reel</span><span class="num taped" style={tape('receipt', 1)}>{formatCount(data.mostViewedVideo)}</span>
							</div>
							<div class="stat-line">
								<span>participants</span><span class="num taped" style={tape('receipt', 2)}>{data.participants}</span>
							</div>
						</div>
					</div>

					<div class="sticky-note">
						<span class="pin" style={sprite('pin')} aria-hidden="true"></span>
						<p class="receipt-title">How it works</p>
						<ol class="steps">
							<li>Sign in with your email</li>
							<li>Post a short-form video (15 seconds or longer) every day and mention Hack Club</li>
							<li>
								<span>
									Drop the link in
									<a href="https://hackclub.enterprise.slack.com/archives/C0C2UM7UCUB" target="_blank" rel="noopener"
										>#dayoneof-submissions</a
									>
								</span>
							</li>
							<li>Keep your streak alive to unlock prizes</li>
							<li>
								<span>
									Chat and ask questions in
									<a href="https://hackclub.enterprise.slack.com/archives/C0C2U1ANNP7" target="_blank" rel="noopener"
										>#dayoneof</a
									>
								</span>
							</li>
						</ol>
					</div>
				</div>
			</section>

			<section>
				<h2 class="eyebrow">How prizes work</h2>
				<div class="prize-box">
					<p>
						Prizes go by your streak. The first time it reaches each number below, we ship you that
						prize, and they stack, so reaching 25 days gets you all four.
					</p>
					<ul class="prize-list">
						{#each milestonePrizes as row}
							<li class="prize-row">
								<span class="prize-mark">{row.mark}</span>
								<span>{row.text}</span>
							</li>
						{/each}
					</ul>
					<p>
						<strong class="grand">Grand prize:</strong> whoever has the most views across all of their
						videos combined at the end gets $500 USD for their setup, like a camera, a mic, or funds
						for their projects.
					</p>
					<p class="bonus">
						<strong class="grand">Sticker bonus:</strong> give helpful feedback on other people's videos
						and you can earn extra stickers on top of your streak prizes.
					</p>
					<span class="sticker" style="--sticker: url({sticker2})">
						<img src={sticker2} alt="Hack Club sticker" width="440" height="271" loading="lazy" decoding="async" />
					</span>
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
									<span class="chevron-icon" aria-hidden="true">
										<span style={sprite('chevron_down')}></span>
										<span class="chevron-hover" style={sprite('chevron_down_red')}></span>
									</span>
								</summary>
								<div class="faq-body">
									{#if item.contact}
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
								<span class="num taped" style={tape('board', i)}>{person.streak}d</span>
							</li>
						{:else}
							<li class="empty-row">Nobody's started a streak yet. Be the first!</li>
						{/each}
					</ol>
				</aside>
			</section>
		</main>

		<footer>
			<span>made for <strong>hack clubbers</strong>, one reel a day. Hack Club is a 501(c)(3) nonprofit.</span>
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
		font-family: var(--font-hand);
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

	.scroll-hint {
		position: fixed;
		left: 50%;
		bottom: 14px;
		width: 28px;
		height: 28px;
		margin-left: -14px;
		opacity: 0.55;
		pointer-events: none;
		z-index: 5;
		transition: opacity 0.3s ease;
		animation: bob 1.8s ease-in-out infinite;
	}

	.scroll-hint.hidden {
		opacity: 0;
	}

	@keyframes bob {
		50% {
			transform: translateY(4px);
		}
	}

	.topbar {
		display: flex;
		justify-content: flex-start;
		align-items: center;
		margin-bottom: 8px;
	}

	.flag {
		margin-top: -28px;
	}

	.flag img {
		display: block;
		width: 180px;
	}

	.hero {
		display: grid;
		grid-template-columns: 1.05fr 0.95fr;
		gap: 40px;
		align-items: start;
		margin-bottom: 56px;
	}

	.wordmark {
		font-size: 1em;
	}

	.wordmark img {
		display: block;
		width: clamp(13em, 16vw + 7em, 21em);
		height: auto;
	}

	.sub {
		margin-top: 0.9em;
		font-size: 1.3em;
		font-weight: 600;
		max-width: 44ch;
	}

	.desc {
		margin-top: 0.7em;
		font-size: 1.1em;
		color: var(--ink-soft);
		max-width: 52ch;
		line-height: 1.5;
	}

	.signup {
		margin-top: 1.6em;
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		position: relative;
	}

	.signup input {
		font: inherit;
		font-size: 0.95em;
		padding: 0.8em 1em;
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
		font-size: 0.95em;
		border-radius: 12px 6px 10px 6px/6px 12px 6px 10px;
		border: 2px solid var(--ink);
		cursor: var(--cursor-pointer);
		white-space: nowrap;
		transform: rotate(-1deg);
		transition:
			transform 0.15s ease,
			padding 0.15s ease,
			box-shadow 0.15s ease,
			filter 0.15s ease;
	}

	.signup button {
		padding: 10px 22px 16px;
		background: var(--accent);
		color: var(--accent-ink);
		box-shadow: inset 0 -5px 0 var(--ink);
	}

	.signup button:hover {
		filter: brightness(1.08);
	}

	.signup button:active {
		padding: 13px 22px;
		box-shadow: none;
		transform: none;
	}

	.signup-note {
		margin-top: 0.75em;
		font-size: 0.95em;
		line-height: 1.5;
		color: var(--ink-soft);
		max-width: 56ch;
	}

	.signup-note strong {
		color: var(--ink);
	}

	.signup-note a,
	.steps a,
	.footer-links a {
		background-image: linear-gradient(var(--tape), var(--tape));
		background-repeat: no-repeat;
		background-position: 0 88%;
		background-size: 0% 45%;
		-webkit-box-decoration-break: clone;
		box-decoration-break: clone;
		transition:
			background-size 0.25s ease,
			color 0.15s ease;
	}

	.signup-note a {
		color: var(--ink);
		font-weight: 700;
	}

	.signup-note a:hover,
	.steps a:hover,
	.footer-links a:hover {
		background-size: 100% 45%;
	}

	.signup-note a:hover {
		color: var(--accent);
	}

	.steps a {
		font-size: 1.05rem;
		font-weight: 800;
		color: var(--accent);
		text-decoration-thickness: 2px;
		text-underline-offset: 3px;
	}

	.steps a:hover {
		color: var(--ink);
	}

	.reel-stack {
		position: relative;
		height: 36em;
		margin-top: -2em;
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
		padding: 0.6em 0.6em 2.1em;
		box-shadow: 4px 5px 0 var(--shadow);
		transition:
			transform 0.22s ease,
			box-shadow 0.22s ease;
	}

	.reel-card.front {
		width: 18em;
		z-index: 2;
		transform: rotate(-2deg);
	}

	.reel-card.back-a,
	.reel-card.back-b {
		width: 12.8em;
		cursor: var(--cursor-pointer);
		z-index: 1;
	}

	.reel-card.back-a {
		top: 1.75em;
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

	.reel-icon {
		width: 1.35rem;
		height: 1.35rem;
		transition: transform 0.15s ease;
	}

	.reel-btn:hover .reel-icon {
		transform: rotate(-10deg) scale(1.1);
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

	section.tight {
		margin-bottom: 24px;
	}

	.eyebrow {
		font-weight: 700;
		font-size: 1.5rem;
		margin-bottom: 18px;
		display: inline-block;
	}

	.idea-box,
	.prize-box,
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

	.prize-box {
		position: relative;
		padding: 24px 26px;
		color: var(--ink-soft);
		line-height: 1.55;
	}

	.prize-box > p {
		margin: 0;
		max-width: 70ch;
	}

	.prize-box .prize-list {
		margin: 14px 0;
	}

	.prize-box .bonus {
		margin-top: 10px;
	}

	.grand {
		color: var(--accent);
	}

	.sticker {
		position: absolute;
		right: 34px;
		bottom: 28px;
		width: clamp(90px, 9vw, 124px);
		transform: rotate(-7deg);
		filter: drop-shadow(3px 4px 0 var(--shadow));
		transition:
			transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
			filter 0.3s ease;
	}

	.sticker img {
		display: block;
		width: 100%;
		height: auto;
	}

	/* A glare band clipped to the sticker's own outline, swept across on hover. */
	.sticker::after {
		content: '';
		position: absolute;
		inset: 0;
		background: linear-gradient(
			115deg,
			transparent 30%,
			rgba(255, 255, 255, 0.75) 45%,
			rgba(255, 255, 255, 0.15) 55%,
			transparent 65%
		);
		background-size: 250% 100%;
		background-position: 150% 0;
		mask: var(--sticker) center / 100% 100% no-repeat;
		pointer-events: none;
	}

	.sticker:hover {
		transform: rotate(-2deg) scale(1.3);
		filter: drop-shadow(6px 8px 0 var(--shadow)) saturate(1.15);
		z-index: 2;
	}

	.sticker:hover::after {
		animation: shine 0.8s ease forwards;
	}

	@keyframes shine {
		to {
			background-position: -50% 0;
		}
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
		font-family: var(--font-hand);
		font-weight: 700;
		font-size: 1.2rem;
	}

	.idea-line {
		font-weight: 600;
	}

	.roll-btn {
		padding: 9px 20px 15px;
		background: var(--ink);
		color: var(--bg);
		box-shadow: inset 0 -5px 0 var(--accent);
		transform: rotate(1deg);
	}

	.roll-btn:hover {
		filter: brightness(1.08);
	}

	.roll-btn:active {
		padding: 12px 20px;
		box-shadow: none;
		transform: none;
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

	.dollar {
		width: 58%;
		height: 58%;
	}

	.tape-strip {
		position: absolute;
		top: -9px;
		left: 50%;
		transform: translateX(-50%) rotate(var(--tilt));
		width: calc(76px + var(--grow) * 3);
		height: calc(20px + var(--grow));
		background: var(--tape-bg);
	}

	.prize-name {
		font-family: var(--font-hand);
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
		min-height: 260px;
		background: var(--note);
		border: 2px solid var(--ink);
		border-radius: 4px 10px 6px 12px/10px 4px 12px 6px;
		padding: 24px 20px 18px;
		transform: rotate(1.5deg);
		box-shadow: 4px 5px 0 var(--shadow);
	}

	.pin {
		position: absolute;
		top: -26px;
		left: 50%;
		width: 42px;
		height: 42px;
		transform: translateX(-50%) rotate(14deg);
		filter: drop-shadow(2px 3px 0 var(--shadow));
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
		font-family: var(--font-hand);
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
		font-family: var(--font-hand);
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
		color: var(--ink);
		padding: 3px 12px;
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
		position: relative;
		flex: 0 0 auto;
		width: 1.6rem;
		height: 1.6rem;
		transition: transform 0.15s ease;
	}

	.chevron-icon span {
		position: absolute;
		inset: 0;
	}

	.chevron-hover {
		opacity: 0;
	}

	.faq-item summary:hover .chevron-hover {
		opacity: 1;
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
		margin: 12px 0 0;
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
		font-family: var(--font-hand);
		font-weight: 700;
		color: var(--ink);
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
		font-family: var(--font-hand);
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
		font-family: var(--font-hand);
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

	/* Desktop hero grows with the viewport while its last line of copy stays above the fold. The
	   height terms are measured slopes (px of hero per px of font); the vw term covers narrow
	   columns, where the copy wraps more. */
	@media (min-width: 761px) {
		.hero {
			font-size: clamp(
				12px,
				min((100dvh - 161px) / 33.25, (100dvh + 11px) / 44, 0.49vw + 10.2px),
				20px
			);
		}
	}

	@media (max-width: 760px) {
		.hero,
		.faq-and-board {
			grid-template-columns: 1fr;
		}

		.prize-box {
			padding-bottom: 120px;
		}
	}


	@media (prefers-reduced-motion: reduce) {
		.blip,
		.prize-cluster,
		.idea-text,
		.scroll-hint,
		.sticker:hover::after {
			animation: none;
		}

		.sticker {
			transition: none;
		}

		.prize-viewport {
			overflow-x: auto;
		}
	}
</style>
