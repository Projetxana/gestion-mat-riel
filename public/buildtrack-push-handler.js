/* Push-only: never intercept fetches or cache authenticated responses. */
self.addEventListener('push', event => {
    // Payloadless push deliberately avoids personal data and cross-account leaks.
    event.waitUntil(self.registration.showNotification('BuildTrack — Rappel des heures', {
        body: 'Pense à vérifier et compléter tes heures de travail.',
        icon: '/logo192.png',
        tag: 'buildtrack-hours',
        data: { route: '/timetracking/manual' },
    }));
});
self.addEventListener('notificationclick', event => {
    event.notification.close();
    const target = new URL('/timetracking/manual', self.location.origin).href;
    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const client = windows.find(item => item.url === target);
        if (client) return client.focus();
        // Do not navigate another open tab: it could contain an unsaved timesheet.
        return self.clients.openWindow(target);
    })());
});
