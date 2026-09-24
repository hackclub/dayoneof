// HCA's ysws_eligible is set on approval and cleared at 19, and HCA omits it entirely when false.
/** @param {unknown} yswsEligible */
export function isYswsEligible(yswsEligible) {
	return yswsEligible === true;
}
