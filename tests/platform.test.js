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
