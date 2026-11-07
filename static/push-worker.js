// Only here for reminders, caches nothing and leaves every request alone
// Plain file instead of src/service-worker, SvelteKit's build adds a module import that older browsers refuse in a worker
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
    const push = event.data?.json();
    if(!push) return;

    event.waitUntil(self.registration.showNotification(push.title, {
        body: push.message,
        tag: push.id,
        icon: '/favicon.svg',
        data: push,

        // Browsers show as many as they can, Chrome two
        actions: [
            ...(push.done ? [{ action: 'done', title: 'Done' }] : []),
            ...(push.snooze ? [{ action: 'hour', title: '1 hour' }, { action: 'tomorrow', title: 'Tomorrow' }] : []),
        ],
    }));
});

self.addEventListener('notificationclick', (event) => {
    const push = event.notification.data;
    event.notification.close();
    event.waitUntil(
        event.action === 'done' ? post(push.done, {})
        : event.action ? post(push.snooze, { until: event.action })
        : open(push.click ?? '/')
    );
});

async function post(link, body) {
    if(!link) return;
    await fetch(link.path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...body, signature: link.signature }),
    });
}

// An open tab beats a new one
async function open(path) {
    const [tab] = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if(!tab) return await self.clients.openWindow(path);

    await tab.focus();
    return await tab.navigate(path);
}
