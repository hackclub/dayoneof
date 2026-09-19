// HCA's verification_status is one of: needs_submission | pending | verified_eligible |
// verified_but_over_18 | rejected | not_found (per hackclub/jamegam's hca.js comments). Treat
// anything starting with "verified" as verified — covers both verified variants without
// hardcoding the full list.
/** @param {string | undefined} status */
export function isHcaVerified(status) {
	return typeof status === 'string' && status.startsWith('verified');
}
