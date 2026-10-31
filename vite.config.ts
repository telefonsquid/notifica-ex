import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-node';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({

			// SVELTEKIT CONFIG
			adapter: adapter(),
			version: {
				name: pkg.version,
			},
			experimental: {
				remoteFunctions: true,
			},

			// VITE PLUGIN CONFIG
			inspector: true,

			// SVELTE CONFIG
			compilerOptions: {
				experimental: {
					async: true
				},

				// SUPPRESS CERTAIN WARNINGS | onwarn is not accepted here, warningFilter replaces it
				warningFilter: (warning) =>
					!warning.code.startsWith('ownership_invalid_mutation') &&
					!warning.code.includes('state_referenced_locally')
			}
		})
	]
});
