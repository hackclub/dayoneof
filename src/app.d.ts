// See https://svelte.dev/docs/kit/types#app.d.ts
declare global {
	namespace App {
		interface Locals {
			session: { slackId: string } | null;
		}
	}

	interface Window {
		goatcounter?: {
			endpoint?: string;
			path?: (path: string) => string | null;
			count?: (vars?: { path?: string; referrer?: string; title?: string }) => void;
		};
	}
}

export {};
