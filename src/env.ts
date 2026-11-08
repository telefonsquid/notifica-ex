import { defineEnvVars } from '@sveltejs/kit/env';
import { z } from 'zod';

// Validated once on startup, a typo in .env fails loudly instead of at the first request
export const variables = defineEnvVars({

    // POCKETBASE
    PUBLIC_POCKETBASE_URL: {
        public: true,
        schema: z.url(),
        description: 'PocketBase as the browser reaches it, used for realtime subscriptions',
    },
    INTERNAL_POCKETBASE_URL: {
        schema: z.url(),
        description: 'PocketBase as the server reaches it, e.g. the docker service name',
    },
    POCKETBASE_SUPERUSER_EMAIL: {
        schema: z.email(),
    },
    POCKETBASE_SUPERUSER_PASSWORD: {
        schema: z.string().min(8),
    },

    // SERVER
    ORIGIN: {
        schema: z.url().optional(),
        description: 'Public URL of the app, also used as the PocketBase app URL in emails',
    },
    SERVER_AUTH_SECRET: {
        schema: z.string().min(16),
        description: 'Shared with the migration and cron containers to call the internal endpoints',
    },
    SIGNING_SECRET: {
        schema: z.string().min(16).optional(),
        description: 'Signs the Done and Snooze buttons in reminders, falls back to SERVER_AUTH_SECRET while unset',
    },

    // NTFY | optional, the other ways to get reminders work without it
    NTFY_URL: {
        schema: z.url().optional(),
    },
    NTFY_TOKEN: {
        schema: z.string().optional(),
        description: 'Token of an ntfy user allowed to publish reminders',
    },
    PUBLIC_NTFY_URL: {
        public: true,
        schema: z.url().optional(),
        description: 'ntfy as the phone app reaches it, shown in the settings for subscribing',
    },
    NTFY_VERSION: {
        schema: z.string().optional(),
        description: 'Version of the ntfy image, shown to admins on the About page since ntfy keeps it to itself',
    },

    // WEB PUSH | optional, browser notifications stay off without them | bunx web-push generate-vapid-keys
    PUBLIC_VAPID_KEY: {
        public: true,
        schema: z.string().optional(),
        description: 'Public key browsers subscribe with',
    },
    VAPID_PRIVATE_KEY: {
        schema: z.string().optional(),
    },

    // POCKETBASE SETTINGS | applied on every start when set, otherwise managed in the PocketBase admin UI
    POCKETBASE_APP_NAME: { schema: z.string().optional() },
    SMTP_HOST: { schema: z.string().optional() },
    SMTP_PORT: { schema: z.coerce.number<string>().int().optional() },
    SMTP_USERNAME: { schema: z.string().optional() },
    SMTP_PASSWORD: { schema: z.string().optional() },
    SMTP_TLS: { schema: z.stringbool().optional() },
    SMTP_SENDER_NAME: { schema: z.string().optional() },
    SMTP_SENDER_ADDRESS: { schema: z.email().optional() },

});
