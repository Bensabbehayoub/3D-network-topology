// Tests de tools/build-precache.js (Ayoub). Placés dans tools/ et non dans tests/ (dossier de Khalil) ;
// `node --test` les trouve quand même.
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { buildManifest, listFiles, render } from './build-precache.js';

const repo = fileURLToPath(new URL('..', import.meta.url));

async function fakeRepo(t, files) {
  const root = await mkdtemp(join(tmpdir(), 'precache-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), content);
  }
  return root;
}

test('le vrai dépôt : la page, les quatre pôles, Three.js et les scénarios sont listés', async () => {
  const files = await listFiles(repo);
  for (const url of [
    './', './index.html', './styles.css', './main.js', './simulation.js', './manifest.json',
    './src/sim/index.js', './src/render/index.js', './src/ui/index.js', './src/xr/index.js',
    './vendor/three/build/three.module.js', './vendor/three/examples/jsm/controls/OrbitControls.js',
    './scenarios/arp.json', './assets/icons/icon-192.png', './assets/icons/icon-512.png',
    './assets/icons/icon-maskable-512.png', './src/ui/install.js',
  ]) {
    assert.ok(files.includes(url), `${url} manquant`);
  }
});

test('le vrai dépôt : ni tests, ni docs, ni outils, ni Service Worker', async () => {
  const files = await listFiles(repo);
  for (const url of files) {
    assert.doesNotMatch(url, /\.test\.m?js$|^\.\/(docs|tests|tools|\.github)\/|^\.\/sw\.js$|precache-manifest/, url);
  }
});

test('chemins relatifs uniquement, triés et sans doublon', async () => {
  const files = await listFiles(repo);
  assert.equal(files[0], './');
  assert.ok(files.every((url) => url.startsWith('./') && !url.includes('\\')));
  assert.deepEqual(files.slice(1), [...files.slice(1)].sort());
  assert.equal(new Set(files).size, files.length);
});

test('filtre par type de fichier et ignore .gitkeep', async (t) => {
  const root = await fakeRepo(t, {
    'index.html': '<!doctype html>',
    'src/ui/a.js': 'a',
    'src/ui/a.test.js': 'test',
    'src/notes.md': '# notes',
    'assets/models/router.glb': 'glb',
    'assets/icons/.gitkeep': '',
    'docs/plan.pdf': 'pdf',
  });
  assert.deepEqual(await listFiles(root), ['./', './assets/models/router.glb', './index.html', './src/ui/a.js']);
});

test('la version change quand un fichier change, et seulement dans ce cas', async (t) => {
  const root = await fakeRepo(t, { 'index.html': 'v1', 'src/a.js': 'a' });
  const first = await buildManifest(root);
  assert.equal((await buildManifest(root)).version, first.version);
  await writeFile(join(root, 'src/a.js'), 'a modifié');
  assert.notEqual((await buildManifest(root)).version, first.version);
});

test('le fichier généré définit self.PRECACHE_MANIFEST', () => {
  const sandbox = {};
  new Function('self', render({ version: 'abc', files: ['./', './index.html'] }))(sandbox);
  assert.deepEqual(sandbox.PRECACHE_MANIFEST, { version: 'abc', files: ['./', './index.html'] });
});
