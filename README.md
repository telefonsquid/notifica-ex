# notifica-ex

Self-hosted notes in the spirit of Google Keep, with reminders pushed to the Android app, the browser and [ntfy](https://ntfy.sh).

## Local development

Needs [Bun](https://bun.sh) and a PocketBase on port 8091 (the compose `pocketbase` service works, or a local binary).

1. `bun install`
2. Copy `.env.example` to `.env` and fill in the marked values. Every variable is validated on startup in `src/env.ts`, so a missing or malformed one stops the server with a clear message.
3. `bun run dev` serves the app on http://localhost:55560.
4. On a fresh PocketBase, create the collections and the first user once:

```bash
curl -X POST -H "Authorization: Bearer <SERVER_AUTH_SECRET>" -H "Content-Type: application/json" http://localhost:55560/api/migration
```

The first user logs in with the superuser email and password from `.env`. Until the first release, `pb_schema.json` is the only schema: in dev the same call imports it again, so run it after every schema change.

Reminders go out when something calls the dispatch endpoint. In compose the PocketBase cron hook does that every minute; locally, either run PocketBase with `pocketbase/cronjobs` as hooks dir and `WEB_INTERNAL_URL` pointing at the dev server, or trigger it by hand:

```bash
curl -X POST -H "Authorization: Bearer <SERVER_AUTH_SECRET>" -H "Content-Type: application/json" http://localhost:55560/api/reminders/dispatch
```

For actual pushes, run an open ntfy on port 8092 and read a topic with `curl "http://localhost:8092/<TOPIC>/json?poll=1"`:

```bash
docker run -d --name notifica-ex-ntfy --restart unless-stopped -p 8092:80 binwiederhier/ntfy:v2.11.0 serve
```

Checks: `bun run check` for types, `bun run lint` for eslint, `bun run test` for the unit tests next to the code (`*.test.ts`).

## Deploying with Docker

### 1. Configure docker compose

Rename `docker-compose-example.yml` to `docker-compose.yml` and fill in the marked values. On the first start the stack creates the PocketBase superuser, the collections and the first web app user by itself.

- `POCKETBASE_SUPERUSER_EMAIL` and `POCKETBASE_SUPERUSER_PASSWORD` must match in `web` and `pocketbase`. They are also the login of the first web app user, so change that password once you are in.
- `SERVER_AUTH_SECRET` must match in `web`, `pocketbase` and the `migration` command.
- `ORIGIN` must match in the `web` build args and its environment. SvelteKit 3 bakes it into the build as the origin it trusts for logins and every other call, without it only https behind a proxy that passes the `Host` header works.
- SMTP is optional, but without it the app cannot send password emails, and that includes the invites under Settings → Users.

Exposed ports default to `3000` (web), `8091` (PocketBase) and `8092` (ntfy). Change the left side of `ports` to use others.

### 2. Run

```bash
docker compose up --build -d
```

The `migration` container waits for the others, triggers the setup and exits. It exits with an error if the setup does not go through, so check its log if the app comes up empty.

### 3. Set up notifications

Everyone picks their ways to get reminders under Settings, Notifications. The Android app needs nothing on the server.

Browser notifications need https and a key pair. Run `bunx web-push generate-vapid-keys` and give both keys to the `web` service as `PUBLIC_VAPID_KEY` and `VAPID_PRIVATE_KEY`. They stay off while those are empty, and changing the keys later means everyone has to turn them on again.

ntfy is optional. It denies all access by default, since reminders are private. Create a user the app publishes with and give its token to the `web` service as `NTFY_TOKEN`:

```bash
docker exec -it notifica-ex-ntfy ntfy user add --role=admin notifica-ex
```

```bash
docker exec -it notifica-ex-ntfy ntfy token add notifica-ex
```

Everyone who gets reminders needs their own ntfy login that may read their topic. Pick the topic in the app under Settings first, then:

```bash
docker exec -it notifica-ex-ntfy ntfy user add alex
```

```bash
docker exec -it notifica-ex-ntfy ntfy access alex <TOPIC> read-only
```

In the ntfy phone app, add the server from `NTFY_BASE_URL` with that login and subscribe to the topic. Settings shows the full address and can send a test.

Task reminders carry a Done button that calls back into the app, so `ORIGIN` must be the address the phone reaches the app at.

### 4. Routing

Put web, PocketBase and ntfy behind a reverse proxy with TLS, and make sure `ORIGIN`, `PUBLIC_POCKETBASE_URL`, `NTFY_BASE_URL` and `PUBLIC_NTFY_URL` match the public addresses. The app keeps every screen live over PocketBase realtime (server sent events), and the Android app holds a stream open to web, so the proxy must not buffer either. With nginx:

```nginx
location / {
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # POCKETBASE REALTIME, THE APP STREAM AND NTFY STREAMS
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_buffering off;
}
```
