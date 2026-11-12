// Tests du Service Worker (sw.js). Il est exécuté dans un faux environnement : faux `caches`,
// faux `fetch`, faux `importScripts`. On vérifie le précache, le nettoyage et chaque cas de fetch.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';

const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const BASE = 'https://exemple.test/3D-network-topology/';
const stripSearch = (url) => url.split('?')[0].split('#')[0];
const urlOf = (request) => (typeof request === 'string' ? request : request.url);

/** Faux CacheStorage : Map nom → Map URL → Response. */
function fakeCaches(initial = {}) {
  const stores = new Map(Object.entries(initial).map(([name, entries]) => [name, new Map(Object.entries(entries))]));
  return {
    stores,
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async put(request, response) { store.set(urlOf(request), response); },
        async match(request, { ignoreSearch = false } = {}) {
          const url = urlOf(request);
          if (store.has(url)) return store.get(url).clone();
          if (ignoreSearch) {
            for (const [key, value] of store) if (stripSearch(key) === stripSearch(url)) return value.clone();
          }
          return undefined;
        },
      };
    },
    async keys() { return [...stores.keys()]; },
    async delete(name) { return stores.delete(name); },
  };
}

/**
 * Lance sw.js. @param {object} options
 * - manifest : contenu de precache-manifest.js, ou null si le fichier manque
 * - network : (url, request) => Response ; lève une erreur pour simuler le hors ligne
 */
function runServiceWorker({ manifest, network = (url) => new Response(`contenu de ${url}`), caches = fakeCaches() } = {}) {
  const listeners = {};
  const requests = [];
  const state = { skipWaiting: 0, claimed: 0 };
  const sandbox = {
    URL, Request, Response, Promise, console: { warn() {}, error() {} },
    caches,
    location: { href: `${BASE}sw.js`, origin: new URL(BASE).origin },
    clients: { claim: async () => { state.claimed += 1; } },
    skipWaiting: async () => { state.skipWaiting += 1; },
    addEventListener: (type, listener) => { listeners[type] = listener; },
    importScripts: () => {
      if (!manifest) throw new Error('NetworkError: precache-manifest.js introuvable');
      sandbox.PRECACHE_MANIFEST = manifest;
    },
    fetch: async (request) => {
      requests.push(request);
      return network(urlOf(request), request);
    },
  };
  sandbox.self = sandbox;
  vm.runInNewContext(source, sandbox);

  /** Déclenche un évènement à durée de vie étendue et attend la fin de waitUntil. */
  const dispatch = async (type) => {
    let done = Promise.resolve();
    listeners[type]({ waitUntil: (promise) => { done = promise; } });
    await done;
  };
  /** Déclenche fetch : renvoie la réponse, ou null si le Service Worker laisse passer la requête. */
  const fetchEvent = async (path, init = {}) => {
    const { mode, ...rest } = init;
    const request = new Request(new URL(path, BASE), rest);
    if (mode) Object.defineProperty(request, 'mode', { value: mode });
    let answer = null;
    listeners.fetch({ request, respondWith: (promise) => { answer = promise; } });
    return answer;
  };
  return { caches, requests, state, dispatch, fetchEvent };
}

const MANIFEST = { version: 'abc123', files: ['./', './index.html', './main.js', './src/ui/index.js'] };

test('installation : tous les fichiers listés sont précachés, en contournant le cache HTTP', async () => {
  const sw = runServiceWorker({ manifest: MANIFEST });
  await sw.dispatch('install');

  const store = sw.caches.stores.get('topology-abc123');
  assert.deepEqual([...store.keys()].sort(), [BASE, `${BASE}index.html`, `${BASE}main.js`, `${BASE}src/ui/index.js`]);
  assert.ok(sw.requests.every((request) => request.cache === 'reload'));
  assert.equal(sw.state.skipWaiting, 1, 'la nouvelle version prend la main sans attendre');
});

test('installation : un fichier manquant fait échouer l\'installation (pas de hors ligne incomplet)', async () => {
  const sw = runServiceWorker({
    manifest: MANIFEST,
    network: (url) => (url.endsWith('main.js') ? new Response('', { status: 404 }) : new Response('ok')),
  });
  await assert.rejects(sw.dispatch('install'), /main\.js → HTTP 404/);
  assert.equal(sw.state.skipWaiting, 0);
});

test('activation : les caches des anciennes versions sont supprimés, pas ceux des autres applications', async () => {
  const caches = fakeCaches({ 'topology-ancien': {}, 'topology-abc123': {}, 'autre-application': {} });
  const sw = runServiceWorker({ manifest: MANIFEST, caches });
  await sw.dispatch('activate');

  assert.deepEqual([...caches.stores.keys()].sort(), ['autre-application', 'topology-abc123']);
  assert.equal(sw.state.claimed, 1);
});

test('fetch : cache d\'abord, sans toucher au réseau, même avec des paramètres d\'URL', async () => {
  const sw = runServiceWorker({ manifest: MANIFEST });
  await sw.dispatch('install');
  const before = sw.requests.length;

  assert.equal(await (await sw.fetchEvent('./main.js')).text(), `contenu de ${BASE}main.js`);
  assert.equal(await (await sw.fetchEvent('./index.html?source=pwa')).text(), `contenu de ${BASE}index.html`);
  assert.equal(sw.requests.length, before, 'aucune requête réseau pour un fichier en cache');
});

test('fetch : repli sur le réseau pour un fichier absent du cache', async () => {
  const sw = runServiceWorker({ manifest: MANIFEST });
  await sw.dispatch('install');
  const before = sw.requests.length;

  const response = await sw.fetchEvent('./scenarios/nouveau.json');
  assert.equal(await response.text(), `contenu de ${BASE}scenarios/nouveau.json`);
  assert.equal(sw.requests.length, before + 1);
});

test('hors ligne : le site se recharge depuis le cache, et une navigation inconnue reçoit index.html', async () => {
  let online = true;
  const sw = runServiceWorker({
    manifest: MANIFEST,
    network: (url) => {
      if (!online) throw new TypeError('Failed to fetch');
      return new Response(`contenu de ${url}`);
    },
  });
  await sw.dispatch('install');
  online = false;

  assert.equal(await (await sw.fetchEvent('./', { mode: 'navigate' })).text(), `contenu de ${BASE}`);
  assert.equal(await (await sw.fetchEvent('./src/ui/index.js')).text(), `contenu de ${BASE}src/ui/index.js`);
  assert.equal(await (await sw.fetchEvent('./page-inconnue', { mode: 'navigate' })).text(), `contenu de ${BASE}index.html`);
  await assert.rejects(sw.fetchEvent('./absent.js'), /Failed to fetch/);
});

test('fetch : les écritures et les autres sites ne passent pas par le cache', async () => {
  const sw = runServiceWorker({ manifest: MANIFEST });
  await sw.dispatch('install');
  assert.equal(await sw.fetchEvent('./index.html', { method: 'POST', body: 'x' }), null);
  assert.equal(await sw.fetchEvent('https://autre-site.test/script.js'), null);
});

test('sans precache-manifest.js : le Service Worker s\'installe et laisse tout passer par le réseau', async () => {
  const sw = runServiceWorker({ manifest: null });
  await sw.dispatch('install');
  await sw.dispatch('activate');
  assert.equal(sw.state.skipWaiting, 1);
  assert.equal(sw.requests.length, 0);
  assert.equal(await sw.fetchEvent('./index.html'), null);
});

test('sw.js n\'utilise que des chemins relatifs', () => {
  assert.doesNotMatch(source, /https?:\/\//);
  assert.match(source, /importScripts\('\.\/precache-manifest\.js'\)/);
});
