import { bootstrap } from '#lib/server/bootstrap.ts';
import { restrictToServer } from '#lib/server/server_auth.ts';

export async function POST({ request }) {

    // RESTRICT TO THE MIGRATION CONTAINER
    restrictToServer(request)

    // FIRST START SETUP
    await bootstrap()

    // RETURN SUCCESS
    return new Response('Migration completed.', { status: 200 });

}
