// Service Worker minimal : il prend le contrôle de la page, sans rien mettre en cache.
// Pas de gestionnaire fetch avant le précache (S6) : Chrome signale un fetch vide comme inutile.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
