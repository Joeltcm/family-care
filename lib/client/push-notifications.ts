function applicationServerKey(value: string) {
  const padding = '='.repeat((4 - value.length % 4) % 4);
  const base64 = (value + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(base64);
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

export function supportsPushNotifications() {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

export async function pushNotificationState() {
  if (!supportsPushNotifications()) return { supported: false, subscribed: false, permission: 'default' as NotificationPermission };
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  return { supported: true, subscribed: Boolean(subscription), permission: Notification.permission };
}

export async function enablePushNotifications() {
  if (!supportsPushNotifications()) throw new Error('push_unsupported');
  const configResponse = await fetch('/api/family-care/push/config', { cache: 'no-store' });
  if (!configResponse.ok) throw new Error('push_config_failed');
  const config = await configResponse.json() as { enabled: boolean; publicKey: string | null };
  if (!config.enabled || !config.publicKey) throw new Error('push_not_configured');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('push_permission_denied');
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: applicationServerKey(config.publicKey),
  });
  const response = await fetch('/api/family-care/push/subscriptions', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(subscription.toJSON()),
  });
  if (!response.ok) throw new Error('push_subscription_failed');
  const test = await fetch('/api/family-care/push/test', { method: 'POST' });
  if (!test.ok) throw new Error('push_test_failed');
  return { subscribed: true };
}

export async function disablePushNotifications() {
  if (!supportsPushNotifications()) return { subscribed: false };
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await fetch('/api/family-care/push/subscriptions', {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ endpoint: subscription.endpoint }),
    });
    await subscription.unsubscribe();
  }
  return { subscribed: false };
}
