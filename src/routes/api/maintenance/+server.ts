import { restrictToServer } from '#lib/server/server_auth.ts';

export async function POST({ request }) {

    // RESTRICT TO THE POCKETBASE CRON HOOK
    restrictToServer(request)

    // RETURN SUCCESS
    return new Response('Maintenance tasks completed.', { status: 200 });

}
