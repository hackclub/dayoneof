// Every read-modify-write of a participant's streak runs through here one at a time, so two quick
// posts, or a post racing reconcile, can't both read the same state and overwrite each other.
// In-process only, so the app must run as a single replica.
/** @type {Promise<unknown>} */
let tail = Promise.resolve();

/**
 * @template T
 * @param {() => Promise<T>} fn
 * @returns {Promise<T>}
 */
export function serialize(fn) {
	const run = tail.then(fn);
	tail = run.catch(() => {});
	return run;
}
