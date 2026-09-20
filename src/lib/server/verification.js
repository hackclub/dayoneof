// HCA's verification_status is needs_submission | pending | verified_eligible |
// verified_but_over_18 | rejected | not_found — match the "verified" prefix to cover both.
/** @param {string | undefined} status */
export function isHcaVerified(status) {
	return typeof status === 'string' && status.startsWith('verified');
}
