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

			// ORIGIN | fixed at build time since SvelteKit 3, the trusted origin for remote calls and forms
			// Unset it follows the host header and assumes https, which fits a TLS proxy but rejects plain http
			// Absolute paths, server code builds links for notifications and queries can't read the request url
			paths: {
				origin: process.env.ORIGIN || undefined,
				relative: false,
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
	],

	// DEV SERVER | the pocketbase container calls the reminder dispatch through this host
	server: {
		allowedHosts: ['host.docker.internal'],
	}
});
