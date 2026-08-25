/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

// injectManifest verlangt diese Zeile als Precache-Einsprungpunkt, auch wenn
// es der Admin-App primaer nur um den Push-Kanal geht, nicht um Offline-
// Faehigkeit - ohne Referenz auf __WB_MANIFEST schlaegt der Build fehl.
self.__WB_MANIFEST;

self.addEventListener('push', (event) => {
  let data: { tag?: string; type?: 'show' | 'close'; title?: string; body?: string; url?: string } = {};
  try {
    data = event.data?.json() ?? {};
  } catch {
    // kein JSON-Payload - leere Notification statt Absturz.
  }
  const tag = data.tag || 'grapino-admin';

  if (data.type === 'close') {
    // Auf einem anderen Geraet (z. B. am Handy) bereits als gelesen markiert
    // - die entsprechende Benachrichtigung hier still wieder wegnehmen,
    // statt sie liegen zu lassen.
    event.waitUntil(
      self.registration.getNotifications({ tag }).then((existing) => existing.forEach((n) => n.close())),
    );
    return;
  }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Grapino Admin', {
      body: data.body || '',
      icon: '/icons/pwa-192x192.png',
      badge: '/icons/pwa-192x192.png',
      tag,
      data: { url: data.url || '/' },
    }),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string } | undefined)?.url || '/';
  event.waitUntil(self.clients.openWindow(url));
});
