// EVERY CALL NAMES A CONTENT TYPE | A POST WITHOUT ONE AND WITHOUT AN ORIGIN COUNTS AS A CROSS SITE FORM, A BUILT APP ANSWERS 403
cronAdd("notifica-ex-reminders", "* * * * *", () => { // every minute

    // WEB CONTAINER AND SHARED SECRET FROM THE COMPOSE FILE
    const webUrl = $os.getenv("WEB_INTERNAL_URL");
    const secret = $os.getenv("SERVER_AUTH_SECRET");
    if (!webUrl || !secret) { console.log("Error: WEB_INTERNAL_URL and SERVER_AUTH_SECRET must be set"); return; }
    const targetUrl = `${webUrl}/api/reminders/dispatch`;          // Route in src/routes/api/reminders/dispatch, a move has to reach here

    // HTTP REQUEST | only failures get logged, this runs every minute
    try {
        const response = $http.send({
            url: targetUrl,
            method: "POST",
            headers: { "Authorization": `Bearer ${secret}`, "Content-Type": "application/json" },
            timeout: 50 // seconds, ends before the next run starts
        });

        if (response.statusCode !== 200) console.log(`Reminder dispatch ${targetUrl} - Status: ${response.statusCode} - ${toString(response.body)}`);

    } catch (err) {
        console.log("Reminder dispatch request failed:", err);
    }

})
