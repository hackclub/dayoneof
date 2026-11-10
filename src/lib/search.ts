// Ranks videos against a typed query. Every word has to match somewhere; names and @handles count
// for more than titles, whole words for more than parts of words, and a one-letter typo still finds
// a word of 4+ letters.

export type Searchable = { names: string[]; titles: string[] };

const NAME_WEIGHT = 2;

export function normalize(text: string) {
	return text
		.normalize('NFKD')
		.replace(/[\u0300-\u036f]/g, '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}]+/gu, ' ')
		.trim();
}

export function terms(query: string) {
	return normalize(query).split(' ').filter(Boolean);
}

// One letter added, dropped, changed, or two neighbours swapped.
function withinOneEdit(a: string, b: string) {
	if (Math.abs(a.length - b.length) > 1) return false;
	if (a.length === b.length) {
		const diff = [...a].flatMap((c, i) => (c === b[i] ? [] : [i]));
		if (diff.length === 2 && diff[1] === diff[0] + 1 && a[diff[0]] === b[diff[1]] && a[diff[1]] === b[diff[0]])
			return true;
	}
	let i = 0;
	let j = 0;
	let edits = 0;
	while (i < a.length && j < b.length) {
		if (a[i] === b[j]) {
			i++;
			j++;
			continue;
		}
		if (++edits > 1) return false;
		if (a.length > b.length) i++;
		else if (b.length > a.length) j++;
		else {
			i++;
			j++;
		}
	}
	return edits + (a.length - i) + (b.length - j) <= 1;
}

function termScore(term: string, text: string) {
	if (!text) return 0;
	if (text === term) return 10;
	const words = text.split(' ');
	if (words.includes(term)) return 6;
	if (words.some((w) => w.startsWith(term))) return 4;
	// Handles like "darsh.codes" or "darshcodes" should match "codes" too.
	if (text.replaceAll(' ', '').includes(term)) return 2;
	const typo = (w: string) => withinOneEdit(term, w) || withinOneEdit(term, w.slice(0, term.length));
	if (term.length >= 4 && words.some(typo)) return 1;
	return 0;
}

/** 0 means it doesn't match; higher is a better match. */
export function score(item: Searchable, query: string) {
	const wanted = terms(query);
	if (!wanted.length) return 1;
	const names = item.names.map(normalize);
	const titles = item.titles.map(normalize);
	let total = 0;
	for (const term of wanted) {
		const best = Math.max(
			0,
			...names.map((n) => termScore(term, n) * NAME_WEIGHT),
			...titles.map((t) => termScore(term, t))
		);
		if (!best) return 0;
		total += best;
	}
	const phrase = wanted.join(' ');
	if (wanted.length > 1 && [...names, ...titles].some((t) => t.includes(phrase))) total += 5;
	return total;
}
