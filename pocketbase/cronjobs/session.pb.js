// SESSION TOKEN FOR SOMEONE WHO SIGNED IN WITH A PASSKEY | asked for by #lib/server/accounts.ts
routerAdd("POST", "/api/notifica/session/{id}", (e) => {
    const user = $app.findRecordById("users", e.request.pathValue("id"));
    return e.json(200, { token: user.newAuthToken() });
}, $apis.requireSuperuserAuth());
