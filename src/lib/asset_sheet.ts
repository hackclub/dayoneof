import assetSheet from '$lib/assets/asset_sheet.webp';

export { assetSheet };

// Drawings sit centred in square 160px cells; tapes fill 320x80 cells.
const SHEET_WIDTH = 960;
const SHEET_HEIGHT = 480;

const sprites = {
	chevron_down: { x: 0, y: 0, w: 160, h: 160 },
	chevron_down_red: { x: 160, y: 0, w: 160, h: 160 },
	badge_arrow: { x: 320, y: 0, w: 160, h: 160 },
	badge_play: { x: 480, y: 0, w: 160, h: 160 },
	badge_pause: { x: 640, y: 0, w: 160, h: 160 },
	badge_dollar: { x: 800, y: 0, w: 160, h: 160 },
	pin: { x: 0, y: 160, w: 160, h: 160 },
	tape_pink_swirls: { x: 320, y: 160, w: 320, h: 80 },
	tape_purple_flowers: { x: 640, y: 160, w: 320, h: 80 },
	tape_blue_waves: { x: 0, y: 320, w: 320, h: 80 },
	tape_mint_waves: { x: 320, y: 320, w: 320, h: 80 },
	tape_lavender_grid: { x: 640, y: 320, w: 320, h: 80 },
	tape_sky_confetti: { x: 0, y: 400, w: 320, h: 80 },
	tape_teal_swirls: { x: 320, y: 400, w: 320, h: 80 },
	tape_red_plaid: { x: 640, y: 400, w: 320, h: 80 },
} as const;

type SpriteName = keyof typeof sprites;

/** Inline style that fills the element with `name`, stretched to its box. */
export function sprite(name: SpriteName) {
	return `background: ${background(name)}`;
}

function background(name: SpriteName) {
	const { x, y, w, h } = sprites[name];
	const pos = `${(x / (SHEET_WIDTH - w)) * 100}% ${(y / (SHEET_HEIGHT - h)) * 100}%`;
	const size = `${(SHEET_WIDTH / w) * 100}% ${(SHEET_HEIGHT / h) * 100}%`;
	return `url(${assetSheet}) ${pos} / ${size} no-repeat`;
}

// Ordered so neighbours always change colour: light blue, purple, deep blue, green.
const TAPES: SpriteName[] = ['tape_sky_confetti', 'tape_lavender_grid', 'tape_teal_swirls', 'tape_mint_waves'];
const HOLDING_TAPES: SpriteName[] = ['tape_blue_waves', 'tape_purple_flowers', 'tape_pink_swirls'];

/** Seeded so server and client agree; the same seed always gets the same strip. */
function random(seed: string) {
	let h = 2166136261;
	for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
	return () => {
		h = (h + 0x6d2b79f5) | 0;
		let t = Math.imul(h ^ (h >>> 15), h | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Vars for `.taped`: a strip behind the element, tilted and a little oversized. Lists pass `index`,
 * which walks the colours in order and alternates the tilt so neighbours never match.
 */
export function tape(seed: string, index = 0, name?: SpriteName) {
	const next = random(seed);
	const start = Math.floor(next() * TAPES.length);
	const side = (next() < 0.5 ? -1 : 1) * (index % 2 ? -1 : 1);
	const nextItem = random(`${seed}${index}`);
	const tilt = side * (1 + nextItem() * 3);
	const grow = 1 + nextItem() * 4;
	return `--tape-bg: ${background(name ?? TAPES[(start + index) % TAPES.length])}; --tilt: ${tilt.toFixed(1)}deg; --grow: ${grow.toFixed(1)}px`;
}

/** `tape`, but always the red strip that sits behind numbers. */
export function numberTape(seed: string, index = 0) {
	return tape(seed, index, 'tape_red_plaid');
}

/** Vars for `.tape-strip.holding`: a skewed, off-centre strip pinning a card up, in blue, purple or pink. */
export function holdingTape(seed: string, index = 0) {
	const start = Math.floor(random(seed)() * HOLDING_TAPES.length);
	const next = random(`${seed}${index}`);
	const tilt = (next() < 0.5 ? -1 : 1) * (4 + next() * 6);
	const shift = (next() - 0.5) * 30;
	const grow = 1 + next() * 4;
	return `--tape-bg: ${background(HOLDING_TAPES[(start + index) % HOLDING_TAPES.length])}; --tilt: ${tilt.toFixed(1)}deg; --shift: ${shift.toFixed(1)}px; --grow: ${grow.toFixed(1)}px`;
}
