import { config } from '$lib/server/config.js';

// The tracker runs in the browser but the endpoint is resolved server-side, so the _DEV/_PROD
// suffix convention in config.js keeps working instead of being duplicated on the client.
export function load() {
	return { goatcounterUrl: config.goatcounterUrl ?? null };
}
