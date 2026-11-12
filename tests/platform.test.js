import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('le manifest reste relatif, pour fonctionner sous /<nom-du-dépôt>/', async () => {
  const manifest = JSON.parse(await read('manifest.json'));
  assert.equal(manifest.start_url, './');
  assert.equal(manifest.scope, './');
  for (const icon of manifest.icons) assert.doesNotMatch(icon.src, /^(\/|https?:)/);
});

test('le manifest rend l\'application installable : id, nom, affichage autonome, icônes', async () => {
  const manifest = JSON.parse(await read('manifest.json'));
  assert.equal(manifest.id, './');
  assert.equal(manifest.display, 'standalone');
  assert.ok(manifest.name && manifest.short_name);
  assert.ok(manifest.icons.length >= 3);
});

test('index.html déclare les icônes par des chemins relatifs', async () => {
  const html = await read('index.html');
  assert.match(html, /<link rel="icon"[^>]* href="assets\/icons\/icon-192\.png">/);
  assert.match(html, /<link rel="apple-touch-icon" href="assets\/icons\/apple-touch-icon\.png">/);
});

test('main.js charge les quatre pôles et sw.js par des chemins relatifs', async () => {
  const main = await read('main.js');
  for (const pole of ['sim', 'render', 'ui', 'xr']) {
    assert.ok(main.includes(`'./src/${pole}/index.js'`), `pôle ${pole} absent`);
  }
  assert.ok(main.includes("register('./sw.js')"));
});

test('aucune dépendance CDN : le hors ligne doit rester possible', async () => {
  for (const path of ['main.js', 'sw.js', 'manifest.json']) {
    assert.doesNotMatch(await read(path), /https?:\/\//, path);
  }
});
