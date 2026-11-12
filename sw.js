// Service Worker : rend l'application utilisable hors ligne après le premier chargement.
//
// - Installation : précache de tous les fichiers listés par tools/build-precache.js
//   (precache-manifest.js, généré à chaque déploiement, non versionné).
// - Cache versionné : son nom contient la version de la liste, qui change dès qu'un fichier
//   change. À l'activation, les caches des anciennes versions sont supprimés.
// - Requêtes : cache d'abord, réseau en repli. Une navigation hors ligne vers une adresse
//   inconnue du cache reçoit index.html.
//
// Tous les chemins sont relatifs à ce fichier : le site est servi sous /<nom-du-dépôt>/.
// Sans precache-manifest.js (développement local sans génération), le Service Worker
// s'installe quand même et laisse tout passer par le réseau.

const CACHE_PREFIX = 'topology-';

let manifest = { version: 'sans-precache', files: [] };
try {
  importScripts('./precache-manifest.js');
  if (self.PRECACHE_MANIFEST && Array.isArray(self.PRECACHE_MANIFEST.files)) manifest = self.PRECACHE_MANIFEST;
} catch (error) {
  console.warn('Service Worker : precache-manifest.js absent, aucun cache hors ligne.', error);
}

const CACHE_NAME = `${CACHE_PREFIX}${manifest.version}`;
const HAS_PRECACHE = manifest.files.length > 0;
const absolute = (path) => new URL(path, self.location.href).href;
const INDEX_URL = absolute('./index.html');

/** Télécharge chaque fichier de la liste en contournant le cache HTTP, puis le range dans le cache. */
async function precache() {
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(manifest.files.map(async (path) => {
    const url = absolute(path);
    const response = await fetch(new Request(url, { cache: 'reload' }));
    // Un fichier manquant fait échouer l'installation : l'ancienne version reste en place,
    // plutôt qu'une version hors ligne incomplète.
    if (!response.ok) throw new Error(`précache : ${path} → HTTP ${response.status}`);
    await cache.put(url, response);
  }));
}

async function deleteOldCaches() {
  const names = await caches.keys();
  await Promise.all(names
    .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
    .map((name) => caches.delete(name)));
}

/** Cache d'abord, réseau en repli ; les réponses du réseau complètent le cache. */
async function respond(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request, { ignoreSearch: true });
  if (cached) return cached;
  try {
    const response = await fetch(request);
    if (response.ok && response.type === 'basic') await cache.put(request, response.clone());
    return response;
  } catch (error) {
    // Hors ligne : une navigation retombe sur la page de l'application.
    if (request.mode === 'navigate') {
      const index = await cache.match(INDEX_URL);
      if (index) return index;
    }
    throw error;
  }
}

self.addEventListener('install', (event) => {
  event.waitUntil((HAS_PRECACHE ? precache() : Promise.resolve()).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(deleteOldCaches().then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  // Seules les lectures de notre propre site sont servies par le cache.
  if (!HAS_PRECACHE || request.method !== 'GET') return;
  if (new URL(request.url).origin !== self.location.origin) return;
  event.respondWith(respond(request));
});
