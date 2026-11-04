// Who's looking at which video on /review, and what was just decided, so reviewers working at the
// same time can see each other. In-process only, like serialize(), so the app runs as one replica.

const VIEWER_TTL_MS = 12_000;
const DECISION_TTL_MS = 15 * 60_000;

/** @type {Map<string, { id: string, drafting: boolean, at: number }>} */
const viewers = new Map();
/** @type {Map<string, { by: string, decision: string, at: number }>} */
const decisions = new Map();
/** @type {Set<string>} */
const claimed = new Set();

/**
 * @param {string} reviewer
 * @param {string} id
 * @param {boolean} drafting
 */
export function view(reviewer, id, drafting) {
	if (id) viewers.set(reviewer, { id, drafting, at: Date.now() });
	else viewers.delete(reviewer);
}

/**
 * @param {string} id
 * @param {string} by
 * @param {string} decision
 */
export function decided(id, by, decision) {
	decisions.set(id, { by, decision, at: Date.now() });
}

/** @param {string} id */
export function undecided(id) {
	decisions.delete(id);
}

export function snapshot() {
	const now = Date.now();
	for (const [reviewer, v] of viewers) if (now - v.at > VIEWER_TTL_MS) viewers.delete(reviewer);
	for (const [id, d] of decisions) if (now - d.at > DECISION_TTL_MS) decisions.delete(id);
	return {
		viewers: [...viewers].map(([slackId, v]) => ({ slackId, id: v.id, drafting: v.drafting })),
		decisions: Object.fromEntries([...decisions].map(([id, d]) => [id, { by: d.by, decision: d.decision }]))
	};
}

// One decision per video at a time, so two reviewers can't both pass the "not reviewed yet" check.
/** @param {string} id */
export function claim(id) {
	if (claimed.has(id)) return false;
	claimed.add(id);
	return true;
}

/** @param {string} id */
export function release(id) {
	claimed.delete(id);
}
