// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			session: { slackId: string } | null;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
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
