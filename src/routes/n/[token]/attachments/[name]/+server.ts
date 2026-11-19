import { requireNoteByLink } from '#lib/server/note_links.ts';
import { downloadRoute } from '#lib/server/note_file_routes.ts';

// The link is the key, no account needed
export const GET = downloadRoute('attachments', async (params) => (await requireNoteByLink(params.token)).note);
