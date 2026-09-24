import { json } from '@sveltejs/kit';

// Liveness only: no Airtable call, so an Airtable outage never restarts the pod.
export function GET() {
	return json({ ok: true });
}
