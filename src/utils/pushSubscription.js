export function pushSupported() {
    return typeof window !== 'undefined' && window.isSecureContext &&
        'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}
export function decodeVapidKey(value) {
    if (!/^[A-Za-z0-9_-]{87}$/.test(value || '')) throw new Error('Clé publique Web Push invalide.');
    const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/') + '=');
    const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    if (bytes.length !== 65 || bytes[0] !== 4) throw new Error('Clé publique Web Push invalide.');
    return bytes;
}
export async function enableDevicePush(client, companyId, userId, registration, publicKey) {
    if (!companyId || !userId || !registration?.active) throw new Error('Application non prête.');
    // Called directly from a click. Never request permission on page load.
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') throw new Error('Notifications non autorisées.');
    const previous = await registration.pushManager.getSubscription();
    const key = decodeVapidKey(publicKey);
    const subscription = previous || await registration.pushManager.subscribe({
        userVisibleOnly: true, applicationServerKey: key,
    });
    const { error } = await client.from('bt_push_subscriptions').upsert({
        endpoint: subscription.endpoint, company_id: companyId, user_id: userId,
    }, { onConflict: 'endpoint' });
    if (error) {
        if (!previous) await subscription.unsubscribe().catch(() => {});
        throw new Error('Abonnement non enregistré. Réessayez ou contactez votre administrateur.');
    }
    return subscription.endpoint;
}
export async function disableDevicePush(client, userId) {
    if (!userId || !pushSupported()) return;
    const registration = await navigator.serviceWorker.getRegistration('/');
    const subscription = await registration?.pushManager.getSubscription();
    if (!subscription) return;
    // Revoke locally first, including if the database is temporarily offline.
    const unsubscribed = await subscription.unsubscribe();
    const { error } = await client.from('bt_push_subscriptions').delete()
        .eq('endpoint', subscription.endpoint).eq('user_id', userId);
    if (error || !unsubscribed) throw new Error('Désactivation à vérifier.');
}
