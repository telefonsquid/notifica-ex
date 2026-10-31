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

    // NTFY | optional until reminders exist
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
