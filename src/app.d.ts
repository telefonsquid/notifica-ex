// See https://svelte.dev/docs/kit/types#app.d.ts

import type { ImageFit, LabelPosition } from '#lib/preferences.ts';
import type { User } from '#lib/schemas.ts';
import type { ThemeName } from '#lib/themes/index.ts';
import type PocketBase from 'pocketbase';

declare global {
	namespace App {

		interface Locals {

			// AUTHENTICATION & DB ACCESS
			pb: PocketBase
			user: undefined | User

			// APPEARANCE
			theme: ThemeName
			labelPosition: LabelPosition
			imageFit: ImageFit

		}

		interface Error {
			message: string;
			details?: string;
		}

	}
}

export { };
