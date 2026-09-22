<script lang="ts">
	import instagramgrid from '$lib/assets/instagramgrid.png';
	import reelVideo from '$lib/assets/reel.mp4';
	import reelThumbnail from '$lib/assets/thumbnail.jpg';
	import reelImage from '$lib/assets/reelimage.png';
	import tshirtimage from '$lib/assets/tshirtimage.png';
	import orpheusplushie from '$lib/assets/orpheusplushie.png';
	import purplesticker from '$lib/assets/purplesticker.webp';
	import heidisticker from '$lib/assets/heidisticker.webp';
	import hackclubsticker from '$lib/assets/hackclubsticker.webp';

	let { data } = $props();

	function formatCount(n: number) {
		if (n >= 1000) return `${Math.round(n / 1000)}k`;
		return String(n);
	}

	const accentFonts = [
		{ family: "'Space Mono', monospace", weight: 700, style: 'italic' },
		{ family: "'IBM Plex Mono', monospace", weight: 600, style: 'normal' },
		{ family: "'Roboto Mono', monospace", weight: 700, style: 'normal' },
		{ family: "'JetBrains Mono', monospace", weight: 800, style: 'normal' },
		{ family: "'DM Mono', monospace", weight: 500, style: 'italic' },
		{ family: "'Fira Code', monospace", weight: 700, style: 'normal' },
		{ family: "'Courier Prime', monospace", weight: 700, style: 'italic' },
		{ family: "'Source Code Pro', monospace", weight: 700, style: 'normal' }
	];

	let fontIndex = $state(0);

	$effect(() => {
		const id = setInterval(() => {
			fontIndex = (fontIndex + 1) % accentFonts.length;
		}, 450);
		return () => clearInterval(id);
	});

	const MEASURE_SIZE = 100;
	let titleRow: HTMLElement | undefined = $state();
	let titleEl: HTMLElement | undefined = $state();
	let titleSize = $state(0);

	function widestTitleWidth(el: HTMLElement) {
		const probe = el.cloneNode(true) as HTMLElement;
		probe.style.cssText = `position:absolute;left:-9999px;top:0;visibility:hidden;width:max-content;font-size:${MEASURE_SIZE}px`;
		const accent = probe.querySelector('.accent') as HTMLElement | null;
		document.body.append(probe);
		let widest = 0;
		for (const font of accentFonts) {
			if (accent) {
				accent.style.fontFamily = font.family;
				accent.style.fontWeight = String(font.weight);
				accent.style.fontStyle = font.style;
			}
			widest = Math.max(widest, probe.getBoundingClientRect().width);
		}
		probe.remove();
		return widest;
	}

	async function fitTitle() {
		if (!titleRow || !titleEl) return;
		await Promise.all(
			accentFonts.map((font) =>
				document.fonts.load(`${font.style} ${font.weight} ${MEASURE_SIZE}px ${font.family}`)
			)
		);
		const widest = widestTitleWidth(titleEl);
		if (widest > 0) titleSize = (titleRow.clientWidth / widest) * MEASURE_SIZE;
	}

	$effect(() => {
		const row = titleRow;
		if (!row) return;
		fitTitle();
		const observer = new ResizeObserver(() => fitTitle());
		observer.observe(row);
		return () => observer.disconnect();
	});

	const reels = [
		{ src: reelVideo, poster: reelThumbnail },
		{ src: reelVideo, poster: reelImage },
		{ src: reelVideo, poster: reelThumbnail }
	];
	let reelIndex = $state(0);
	const prevIndex = $derived((reelIndex - 1 + reels.length) % reels.length);
	const nextIndex = $derived((reelIndex + 1) % reels.length);

	function nextReel() {
		reelIndex = nextIndex;
	}

	function prevReel() {
		reelIndex = prevIndex;
	}

	const prizeItems = [
		{ kind: 'stickers', name: 'Stickers', label: '2 day prize' },
		{ kind: 'tshirt', name: 'T-shirt', label: '7 day prize' },
		{ kind: 'plushie', name: 'Plushie', label: '25 day prize' }
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
			a: 'Post a video every day to keep your streak going. Every 2 days you post, you bank a streak freeze, and a freeze automatically covers a day you miss. Run out of freezes and miss a day, and the streak breaks.'
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
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link
		href="https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@1,900&family=Space+Mono:ital,wght@1,700&family=IBM+Plex+Mono:wght@600&family=Roboto+Mono:wght@700&family=JetBrains+Mono:wght@800&family=DM+Mono:ital,wght@1,500&family=Fira+Code:wght@700&family=Courier+Prime:ital,wght@1,700&family=Source+Code+Pro:wght@700&family=Pixelify+Sans:wght@500;700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<main class="hero">
	<div class="grid-bg" style="background-image: url({instagramgrid})"></div>
	<div class="dot-screen"></div>

	<div class="content">
		<div class="top-row" bind:this={titleRow}>
			<h1 class="title" bind:this={titleEl} style={titleSize ? `font-size: ${titleSize}px` : ''}>
				<span class="wordmark">Day One Of</span>
				<span
					class="accent"
					style="font-family: {accentFonts[fontIndex].family}; font-weight: {accentFonts[fontIndex]
						.weight}; font-style: {accentFonts[fontIndex].style}"
				>
					anything you want.
				</span>
			</h1>
		</div>

		<div class="mid-block">
			<p class="lead">Most people spend too much time scrolling. Instead, post content and get prizes!</p>

			<p class="summary">
				Post a shortform video everyday for a month about anything at all. Get feedback from others
				to improve your content every day!
			</p>

			<div class="cta-row">
				<form class="email-form" action="/api/auth/login" method="GET">
					<input class="email-input" type="email" name="email" placeholder="Enter your email…" required />
					<button class="start-btn" type="submit">Start!</button>
				</form>
			</div>

			<div class="idea-generator">
				<h2 class="get-heading">Need a reel idea?</h2>
				<div class="idea-row">
					{#key ideaIndex}
						<p class="idea-text">
							<span class="idea-caret" aria-hidden="true">&gt;</span>
							<span>{reelIdeas[ideaIndex]}</span>
						</p>
					{/key}
					<button class="idea-btn" type="button" onclick={generateIdea}>Generate idea</button>
				</div>
			</div>
		</div>

		<div class="bottom-row">
			<div class="prize-panel">
				<h2 class="get-heading">You could get:</h2>
				<div class="prize-marquee">
					<div class="prize-track">
						{#each prizeLoop as prize}
							<div class="prize-item">
								{#if prize.kind === 'stickers'}
									<div class="reward-img sticker-cluster">
										<img src={purplesticker} alt="" class="s1" />
										<img src={heidisticker} alt="" class="s2" />
										<img src={hackclubsticker} alt="" class="s3" />
									</div>
								{:else if prize.kind === 'tshirt'}
									<div class="reward-img">
										<img src={tshirtimage} alt="Hack Club t-shirt" />
									</div>
								{:else}
									<div class="reward-img">
										<img src={orpheusplushie} alt="Orpheus plushie" />
									</div>
								{/if}
								<span class="prize-name">{prize.name}</span>
								<span class="prize-days">{prize.label}</span>
							</div>
						{/each}
					</div>
				</div>
				<p class="disclaimer">The most-viewed creator gets $500 for setup upgrades!</p>
			</div>

			<aside class="stats-card">
				<span class="stats-kicker">So far…</span>
				<dl class="stat-list">
					<div class="stat-row">
						<dt>Total views</dt>
						<dd>{formatCount(data.totalViews)}</dd>
					</div>
					<div class="stat-row">
						<dt>Most viewed</dt>
						<dd>{formatCount(data.mostViewedVideo)}</dd>
					</div>
					<div class="stat-row">
						<dt>Participants</dt>
						<dd>{data.participants}</dd>
					</div>
				</dl>
			</aside>
		</div>
	</div>

	<div class="showcase">
		<div class="peek peek-top">
			<img src={reels[prevIndex].poster} alt="Previous reel" />
		</div>
		<button class="chevron chevron-top" type="button" onclick={prevReel} aria-label="Previous reel">
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M6 15l6-6 6 6" />
			</svg>
		</button>

		<div class="featured">
			{#key reelIndex}
				<video src={reels[reelIndex].src} poster={reels[reelIndex].poster} autoplay muted loop playsinline
				></video>
			{/key}
		</div>

		<button class="chevron chevron-bottom" type="button" onclick={nextReel} aria-label="Next reel">
			<svg viewBox="0 0 24 24" aria-hidden="true">
				<path d="M6 9l6 6 6-6" />
			</svg>
		</button>
		<div class="peek peek-bottom">
			<img src={reels[nextIndex].poster} alt="Next reel" />
		</div>
	</div>
</main>

<section class="faq-section">
	<div class="faq-wrap">
		<div class="faq-col">
			<span class="stats-kicker">FAQ</span>
			<h2 class="section-heading">Got questions?</h2>
			<p class="section-lead">Here's the short version of everything you need to know.</p>

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
											<span class="prize-day">{row.mark}</span>
											<span class="prize-text">{row.text}</span>
										</li>
									{/each}
								</ul>
								<p class="faq-note"><strong>Grand prize:</strong> {item.note}</p>
							{:else if item.contact}
								<p>
									Reach out at <a href="mailto:darshg321@gmail.com">darshg321@gmail.com</a>, message
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

		<aside class="board">
			<span class="stats-kicker">Leaderboard</span>
			<ol class="rows">
				{#each data.leaderboard as person, i}
					<li class="row row-{i + 1}">
						<span class="rank rank-{i + 1}">{i + 1}</span>
						{#if person.slackId}
							<a class="row-name" href="/user/{person.slackId}">
								<span class="row-title">{person.name}</span>
							</a>
						{:else}
							<span class="row-name"><span class="row-title">{person.name}</span></span>
						{/if}
						<span class="row-value">{person.streak}d</span>
					</li>
				{:else}
					<li class="empty-row">Nobody's started a streak yet. Be the first!</li>
				{/each}
			</ol>
		</aside>
	</div>
</section>

<footer class="site-footer">
	<p class="footer-made">made with &lt;3 by teens, for teens</p>
	<nav class="footer-links" aria-label="Hack Club">
		<a href="https://hackclub.com" target="_blank" rel="noopener" class="link-hackclub">hack club</a>
		<span class="footer-dot" aria-hidden="true"></span>
		<a href="https://slack.hackclub.com" target="_blank" rel="noopener" class="link-slack">slack</a>
		<span class="footer-dot" aria-hidden="true"></span>
		<a href="https://clubs.hackclub.com" target="_blank" rel="noopener" class="link-clubs">clubs</a>
		<span class="footer-dot" aria-hidden="true"></span>
		<a href="https://hackathons.hackclub.com" target="_blank" rel="noopener" class="link-hackathons"
			>hackathons</a
		>
	</nav>
</footer>

<style>
	:global(:root) {
		--shadow-reel: 0 12px 36px rgb(18 18 23 / 0.55);
		--shadow-peek: 0 10px 30px rgb(18 18 23 / 0.65);
		--ring-reel: 0 0 0 3px var(--white);

		--fade-length: 260px;
		--fade-overhang: 180px;
		--fade-ramp: linear-gradient(
			to right,
			rgb(0 0 0 / 1) calc(100% - var(--fade-length)),
			rgb(0 0 0 / 0.95) calc(100% - var(--fade-length) * 0.82),
			rgb(0 0 0 / 0.8) calc(100% - var(--fade-length) * 0.62),
			rgb(0 0 0 / 0.52) calc(100% - var(--fade-length) * 0.42),
			rgb(0 0 0 / 0.24) calc(100% - var(--fade-length) * 0.24),
			rgb(0 0 0 / 0.07) calc(100% - var(--fade-length) * 0.1),
			rgb(0 0 0 / 0) 100%
		);

		--dot-gap: 5px;
		--dot-size: 1.1px;
		--grid-opacity: 0.4;
		--marquee-duration: 26s;
	}

	:global(html, body) {
		overflow-x: hidden;
	}

	.hero {
		display: grid;
		grid-template-columns: 1fr 1fr;
		grid-template-rows: minmax(0, 1fr);
		width: 100vw;
		height: 100dvh;
		margin: 0;
		overflow: hidden;
		position: relative;
		background: var(--darker);
	}

	.content {
		display: flex;
		flex-direction: column;
		justify-content: center;
		height: 100%;
		min-height: 0;
		min-width: 0;
		box-sizing: border-box;
		padding: var(--space-3) var(--gutter);
		gap: var(--stack);
		position: relative;
		z-index: 1;
	}

	.content::before {
		content: '';
		position: absolute;
		inset: 0 calc(-1 * var(--fade-overhang)) 0 0;
		z-index: -1;
		background: var(--background);
		-webkit-mask-image: var(--fade-ramp);
		mask-image: var(--fade-ramp);
	}

	.top-row {
		display: flex;
		align-items: flex-start;
		overflow: visible;
	}

	.title {
		margin: 0;
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		flex-wrap: nowrap;
		align-items: baseline;
		white-space: nowrap;
		gap: 0 0.35em;
		line-height: 1.05;
		font-size: clamp(1.1rem, 2.6vw, 3.4rem);
	}

	.wordmark {
		font-family: 'Playfair Display', Georgia, 'Times New Roman', serif;
		font-style: italic;
		font-weight: 900;
		letter-spacing: -0.01em;
		color: var(--heading);
		font-size: 1em;
	}

	.accent {
		display: inline-block;
		white-space: nowrap;
		color: var(--accent);
		font-size: 0.92em;
		transition: font-family 0.1s ease-in-out;
	}

	.prize-panel {
		flex: 1 1 auto;
		min-width: 0;
		align-self: flex-start;
		margin-top: var(--stack);
	}

	.mid-block {
		display: flex;
		flex-direction: column;
	}

	.lead {
		font-size: clamp(0.8rem, 1.18vw, 1.5rem);
		white-space: nowrap;
		margin: 0 0 var(--stack);
		color: var(--secondary);
		line-height: 1.45;
	}

	.summary {
		font-size: clamp(0.72rem, 1.05vw, 1.1rem);
		color: var(--secondary);
		line-height: 1.5;
		max-width: 46rem;
		margin: 0 0 var(--stack);
	}

	.cta-row {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: var(--space-3) var(--space-5);
	}

	.email-form {
		display: flex;
		gap: var(--space-3);
		flex-wrap: wrap;
	}

	.email-input {
		font-family: inherit;
		font-size: 1.2rem;
		color: var(--heading);
		background: var(--background);
		border: 2px solid var(--accent);
		border-radius: var(--radius);
		padding: var(--space-3) 1.4rem;
		width: min(24rem, 55vw);
		outline: none;
		transition: box-shadow var(--transition-hover);
	}

	.email-input:focus {
		box-shadow: 0 0 0 4px var(--accent-glow);
	}

	.start-btn {
		font-family: inherit;
		font-weight: bold;
		font-size: 1.2rem;
		background: var(--accent);
		color: var(--white);
		border: none;
		border-radius: var(--radius);
		padding: var(--space-3) 2.1rem;
		cursor: pointer;
		transition: transform var(--transition-press);
	}

	.start-btn:hover,
	.start-btn:focus-visible {
		transform: translateY(-2px);
	}

	.start-btn:active {
		transform: translateY(0);
	}

	.bottom-row {
		display: flex;
		gap: var(--space-5);
		align-items: flex-end;
	}

	.idea-generator {
		margin-top: var(--stack-lg);
		min-width: 0;
	}

	.get-heading {
		font-size: clamp(1.6rem, 1.15vh + 1.15vw, 2.3rem);
		margin: 0 0 var(--stack);
		color: var(--heading);
	}

	.idea-row {
		display: flex;
		align-items: center;
		gap: var(--space-4);
	}

	.idea-text {
		display: flex;
		gap: 0.55em;
		flex: 1 1 auto;
		min-width: 0;
		font-size: clamp(1.1rem, 0.85vh + 0.5vw, 1.5rem);
		color: var(--secondary);
		min-height: 1.35em;
		padding-left: var(--space-4);
		margin: 0;
		line-height: 1.35;
	}

	.idea-caret {
		font-family: 'Space Mono', monospace;
		font-weight: 700;
		color: var(--accent);
	}

	.idea-btn {
		font-family: inherit;
		font-weight: bold;
		font-size: 1.25rem;
		background: var(--accent);
		color: var(--white);
		border: none;
		border-radius: var(--radius);
		padding: var(--space-3) 1.8rem;
		flex: 0 0 auto;
		white-space: nowrap;
		cursor: pointer;
		transition: transform var(--transition-press);
	}

	.idea-btn:hover {
		transform: translateY(-2px);
	}

	.prize-marquee {
		overflow: hidden;
		width: 100%;
		-webkit-mask-image: linear-gradient(
			to right,
			transparent,
			var(--darker) 6%,
			var(--darker) 90%,
			transparent
		);
		mask-image: linear-gradient(
			to right,
			transparent,
			var(--darker) 6%,
			var(--darker) 90%,
			transparent
		);
	}

	.prize-track {
		display: flex;
		gap: var(--space-4);
		width: max-content;
		animation: prize-scroll var(--marquee-duration) linear infinite;
	}

	@keyframes prize-scroll {
		from {
			transform: translateX(0);
		}
		to {
			transform: translateX(-50%);
		}
	}

	.prize-item {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: var(--space-1);
		width: clamp(8rem, 12.5vw, 10.5rem);
		flex-shrink: 0;
	}

	.reward-img {
		width: clamp(96px, 15vh, 148px);
		height: clamp(96px, 15vh, 148px);
		display: flex;
		align-items: center;
		justify-content: center;
		position: relative;
		flex-shrink: 0;
	}

	.reward-img img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}

	.sticker-cluster {
		width: clamp(130px, 20vh, 190px);
	}

	.sticker-cluster img {
		position: absolute;
		max-width: 66%;
		max-height: 66%;
	}

	.sticker-cluster .s1 {
		left: 0;
		top: 4%;
	}

	.sticker-cluster .s2 {
		right: 0;
		top: 0;
	}

	.sticker-cluster .s3 {
		bottom: 0;
		left: 15%;
		max-width: 72%;
		max-height: 48%;
	}

	.prize-name {
		font-size: clamp(1rem, 0.6vh + 0.45vw, 1.25rem);
		font-weight: bold;
		color: var(--heading);
		white-space: nowrap;
	}

	.prize-days {
		font-size: clamp(0.85rem, 0.5vh + 0.35vw, 1.05rem);
		font-weight: 600;
		color: var(--muted);
		white-space: nowrap;
	}

	.disclaimer {
		max-width: 100%;
		color: var(--heading);
		font-weight: bold;
		font-size: clamp(1.2rem, 0.8vh + 0.7vw, 1.7rem);
		margin: var(--stack) 0 0;
	}

	.stats-card {
		flex: 0 0 19rem;
		background: var(--sheet);
		border-radius: 10px;
		padding: var(--space-3) var(--space-4);
	}

	.stats-kicker {
		display: inline-block;
		background: var(--accent);
		color: var(--white);
		font-weight: bold;
		font-style: italic;
		font-size: clamp(1.43rem, 1.95vh, 1.75rem);
		padding: var(--space-2) 1.8rem;
		border-radius: var(--radius-pill);
		margin-bottom: var(--space-2);
	}

	.stat-list {
		margin: 0;
	}

	.stat-row {
		display: flex;
		align-items: center;
		padding: var(--space-1) 0;
		border-bottom: 1px solid var(--border);
	}

	.stat-row:last-child {
		border-bottom: none;
		padding-bottom: 0;
	}

	.stat-row dt {
		flex: 1 1 auto;
		background: var(--orange);
		color: var(--white);
		font-size: 1.36rem;
		font-weight: 500;
		line-height: 1;
		border-radius: var(--radius-pill);
		padding: 0.42rem 2.4rem 0.42rem 0.9rem;
		margin-right: -1.7rem;
	}

	.stat-row dd {
		position: relative;
		flex: 0 0 auto;
		margin: 0;
		color: var(--heading);
		background: var(--background);
		font-weight: 600;
		font-size: 1.36rem;
		line-height: 1;
		border: 2px solid var(--accent);
		border-radius: var(--radius-pill);
		padding: 0.3rem 0.9rem;
	}

	.showcase {
		position: relative;
		z-index: 1;
		overflow: hidden;
		height: 100%;
		width: 100%;
	}

	.grid-bg {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		left: calc(50% - var(--fade-length) + var(--fade-overhang));
		background-size: cover;
		background-position: center;
		opacity: var(--grid-opacity);
	}

	.dot-screen {
		position: absolute;
		inset: 0;
		background-image: radial-gradient(var(--darker) var(--dot-size), transparent var(--dot-size));
		background-size: var(--dot-gap) var(--dot-gap);
		pointer-events: none;
	}

	.featured {
		position: absolute;
		left: 50%;
		top: 50%;
		transform: translate(-50%, -50%);
		height: 62%;
		max-width: 60%;
		aspect-ratio: 9 / 16;
		border-radius: var(--radius-lg);
		overflow: hidden;
		box-shadow: var(--ring-reel), var(--shadow-reel);
		z-index: 2;
	}

	.featured video {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.peek {
		position: absolute;
		left: 50%;
		height: 16%;
		max-width: 36%;
		aspect-ratio: 9 / 16;
		border-radius: 12px;
		overflow: hidden;
		opacity: 0.85;
		box-shadow: var(--shadow-peek);
		z-index: 1;
	}

	.peek img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.peek-top {
		top: 2%;
		transform: translateX(-50%);
	}

	.peek-bottom {
		bottom: 2%;
		transform: translateX(-50%);
	}

	.chevron {
		position: absolute;
		left: 50%;
		transform: translate(-50%, -50%);
		z-index: 3;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.8rem;
		height: 2.8rem;
		border-radius: var(--radius);
		border: none;
		background: var(--accent);
		color: var(--white);
		box-shadow: var(--shadow-peek);
		cursor: pointer;
		transition:
			background-color var(--transition-hover),
			transform var(--transition-hover);
	}

	.chevron svg {
		width: 1.5rem;
		height: 1.5rem;
		fill: none;
		stroke: currentColor;
		stroke-width: 3;
		stroke-linecap: round;
		stroke-linejoin: round;
	}

	.chevron:hover {
		background: var(--accent-veil);
		transform: translate(-50%, -50%) scale(1.08);
	}

	.chevron-top {
		top: 18.5%;
	}

	.chevron-bottom {
		top: 81.5%;
	}

	@keyframes rise-in {
		from {
			opacity: 0;
			transform: translateY(1.25rem);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	@keyframes fade-in {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}

	@keyframes reel-in {
		from {
			opacity: 0;
			transform: translateY(2.5rem) scale(0.96);
		}
		to {
			opacity: 1;
			transform: translateY(0) scale(1);
		}
	}

	.title,
	.lead,
	.summary,
	.cta-row,
	.idea-generator,
	.bottom-row {
		animation: rise-in 0.6s var(--ease-out) backwards;
	}

	.lead {
		animation-delay: 0.08s;
	}

	.summary {
		animation-delay: 0.16s;
	}

	.cta-row {
		animation-delay: 0.24s;
	}

	.idea-generator {
		animation-delay: 0.32s;
	}

	.bottom-row {
		animation-delay: 0.4s;
	}

	.idea-text {
		animation: fade-in 0.35s ease-in-out;
	}

	.featured {
		animation: reel-in 0.45s var(--ease-out);
	}

	.peek,
	.chevron {
		animation: fade-in 0.7s ease-in-out backwards;
		animation-delay: 0.3s;
	}

	.prize-item {
		transition: transform var(--transition-hover);
	}

	.prize-item:hover {
		transform: translateY(-5px) scale(1.06);
	}

	.stats-card {
		animation: rise-in 0.6s var(--ease-out) 0.48s backwards;
	}

	@media (prefers-reduced-motion: reduce) {
		.title,
		.lead,
		.summary,
		.cta-row,
		.idea-generator,
		.bottom-row,
		.idea-text,
		.featured,
		.peek,
		.chevron,
		.stats-card,
		.prize-track {
			animation: none;
		}
	}

	.faq-section {
		position: relative;
		z-index: 1;
		background: var(--sheet);
		border-top: 1px solid var(--border);
		padding: var(--space-5) var(--gutter);
	}

	.faq-wrap {
		display: grid;
		grid-template-columns: 1fr 1.15fr;
		gap: var(--space-5);
		max-width: 92rem;
		margin: 0 auto;
		align-items: start;
	}

	.faq-col {
		min-width: 0;
	}

	.section-heading {
		font-size: clamp(1.8rem, 1.4vw + 1.4rem, 2.6rem);
		color: var(--heading);
		margin: var(--space-3) 0 var(--space-2);
	}

	.section-lead {
		font-size: clamp(0.95rem, 0.4vw + 0.85rem, 1.15rem);
		color: var(--secondary);
		line-height: 1.55;
		max-width: 40rem;
		margin: 0 0 var(--space-4);
	}

	.section-lead a {
		color: var(--accent);
		font-weight: 600;
	}

	.accordion {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
	}

	.faq-item {
		background: var(--background);
		border: 1px solid var(--border);
		border-radius: var(--radius);
	}

	.faq-item summary {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: var(--space-3);
		list-style: none;
		cursor: pointer;
		padding: var(--space-4);
		font-weight: bold;
		color: var(--heading);
		font-size: clamp(1rem, 0.15vw + 0.95rem, 1.15rem);
	}

	.faq-item summary::marker,
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
		transition: transform var(--transition-hover);
	}

	.faq-item[open] .chevron-icon {
		transform: rotate(180deg);
	}

	.faq-body {
		padding: 0 var(--space-4) var(--space-4);
		color: var(--secondary);
	}

	.faq-body p {
		margin: 0;
		font-size: clamp(0.85rem, 0.15vw + 0.8rem, 1rem);
		line-height: 1.6;
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
		gap: 0.6rem;
	}

	.prize-row {
		display: flex;
		align-items: center;
		gap: var(--space-3);
	}

	.prize-day {
		flex: 0 0 auto;
		min-width: 4.25rem;
		font-size: 0.85rem;
		font-weight: bold;
		color: var(--heading);
	}

	.prize-text {
		font-size: clamp(0.85rem, 0.15vw + 0.8rem, 1rem);
	}

	.faq-body p.faq-note {
		margin: var(--space-3) 0 0;
		font-size: clamp(0.85rem, 0.15vw + 0.8rem, 1rem);
	}

	.faq-note strong {
		color: var(--accent);
	}

	.board {
		display: flex;
		flex-direction: column;
		gap: var(--space-4);
		background: var(--background);
		border: 1px solid var(--border);
		border-top: 4px solid var(--accent);
		border-radius: var(--radius-lg);
		box-shadow: 0 6px 24px rgb(18 18 23 / 0.08);
		padding: var(--space-5);
		box-sizing: border-box;
		position: sticky;
		top: var(--space-5);
	}

	.board .stats-kicker {
		align-self: flex-start;
		font-size: clamp(1.5rem, 0.6vw + 1.35rem, 1.8rem);
	}

	.rows {
		list-style: none;
		margin: 0;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.row {
		display: flex;
		align-items: center;
		gap: var(--space-4);
		border-bottom: 1px solid var(--border);
		padding: 0.85rem 0.3rem;
		border-radius: var(--radius);
		min-width: 0;
	}

	.row:last-child {
		border-bottom: none;
	}

	.row-1 {
		background: var(--accent-glow);
	}

	.row-2 {
		background: rgb(51 142 218 / 0.06);
	}

	.row-3 {
		background: rgb(51 142 218 / 0.03);
	}

	.row-1 .row-title {
		font-size: 1.08em;
	}

	.row-1 .row-value {
		color: var(--accent);
	}

	.rank {
		flex: 0 0 auto;
		width: 2.4rem;
		height: 2.4rem;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: 50%;
		background: var(--sheet);
		color: var(--muted);
		font-weight: bold;
		font-variant-numeric: tabular-nums;
		font-size: 1.05rem;
	}

	.rank-1 {
		background: var(--orange);
		color: var(--white);
	}

	.row-name {
		flex: 1 1 auto;
		min-width: 0;
		display: flex;
		font-weight: bold;
		font-size: 1.2rem;
		color: var(--heading);
		text-decoration: none;
	}

	.row-name:is(a):hover {
		color: var(--accent);
	}

	.row-title {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.row-value {
		flex: 0 0 auto;
		font-weight: bold;
		font-variant-numeric: tabular-nums;
		font-size: 1.25rem;
		color: var(--heading);
	}

	.empty-row {
		color: var(--secondary);
		font-size: 1rem;
		padding: var(--space-2);
	}

	.site-footer {
		background: var(--background);
		padding: var(--space-5) var(--gutter) var(--space-4);
		text-align: center;
	}

	.footer-made {
		font-family: 'Pixelify Sans', sans-serif;
		font-weight: 500;
		font-size: clamp(1.05rem, 0.3vw + 0.95rem, 1.3rem);
		color: #b0a6ad;
		margin: 0 0 var(--space-2);
	}

	.footer-links {
		display: flex;
		align-items: center;
		justify-content: center;
		flex-wrap: wrap;
		gap: 0.7rem;
		font-family: 'Pixelify Sans', sans-serif;
		font-weight: 700;
		font-size: clamp(1.1rem, 0.35vw + 1rem, 1.4rem);
	}

	.footer-links a {
		text-decoration: none;
		transition: opacity var(--transition-hover);
	}

	.footer-links a:hover {
		opacity: 0.7;
	}

	.footer-dot {
		width: 0.4rem;
		height: 0.4rem;
		border-radius: 1px;
		background: var(--muted);
		opacity: 0.5;
		transform: rotate(45deg);
	}

	.link-hackclub {
		color: #c48f92;
	}

	.link-slack {
		color: #7fa87a;
	}

	.link-clubs {
		color: #8890c4;
	}

	.link-hackathons {
		color: #a985bd;
	}

	@media (max-width: 62rem) {
		.faq-wrap {
			grid-template-columns: 1fr;
		}

		.board {
			position: static;
		}
	}
</style>
