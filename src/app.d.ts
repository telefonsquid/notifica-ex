// See https://svelte.dev/docs/kit/types#app.d.ts

import type { Preferences } from '#lib/preferences.ts'
import type { User } from '#lib/schemas/users.ts';
import type PocketBase from 'pocketbase'

declare global {
    namespace App {

        interface Locals {

            // AUTHENTICATION & DB ACCESS
            pb: PocketBase
            user: undefined | User
            serverDown?: boolean

            preferences: Preferences

        }

        interface Error {
            message: string
            details?: string
        }

    }
}

export { }
