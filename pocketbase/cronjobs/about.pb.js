// VERSION FOR THE ABOUT PAGE | PB_VERSION comes from the Dockerfile, read by #lib/server/about.ts
routerAdd("GET", "/api/notifica/version", (e) => {
    return e.json(200, { version: $os.getenv("PB_VERSION") || null });
}, $apis.requireSuperuserAuth());
