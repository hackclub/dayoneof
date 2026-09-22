import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	server: {
		// Vite defaults to `localhost`, which Node resolves to ::1 only — the tunnel proxies to
		// 127.0.0.1 and gets a refused connection.
		host: '127.0.0.1',
		allowedHosts: ['.ngrok-free.app', '.ts.net']
	},
	plugins: [
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter()
		})
	]
});
