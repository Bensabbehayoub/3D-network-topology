// Tests du pôle ui (Ramy). Placés ici et non dans tests/ (dossier de Khalil) ;
// `node --test` les trouve quand même. Aucun DOM sous Node : on utilise de faux conteneurs.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { init, MOUNT_POINTS } from './index.js';

const read = (path) => readFile(new URL(`../../${path}`, import.meta.url), 'utf8');

// Faux document : un conteneur { innerHTML } par id fourni.
function fakeRoot(ids) {
  const elements = new Map(ids.map((id) => [id, { id, innerHTML: '' }]));
  return { elements, getElementById: (id) => elements.get(id) ?? null };
}

const UI_IDS = ['controls', 'scenario-picker', 'inspector', 'explanations', 'install-slot'];

test('init monte tous les modules quand app est vide (pôles sim et render absents)', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const root = fakeRoot(Object.values(MOUNT_POINTS));

  const ui = await init({}, { root });

  assert.deepEqual(Object.keys(ui.modules).sort(), ['controls', 'explanations', 'inspector', 'install', 'scenarioPicker']);
  for (const id of UI_IDS) {
    assert.notEqual(root.elements.get(id).innerHTML.trim(), '', `#${id} est resté vide`);
  }
  assert.equal(console.warn.mock.callCount(), 0);
});

test('init ne touche pas aux points de montage des autres pôles', async () => {
  const root = fakeRoot(Object.values(MOUNT_POINTS));
  await init({}, { root });
  for (const id of ['scene', 'xr-slot']) {
    assert.equal(root.elements.get(id).innerHTML, '', `#${id} appartient à un autre pôle`);
  }
});

test('init continue si un point de montage manque, avec un avertissement', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const root = fakeRoot(UI_IDS.filter((id) => id !== 'inspector'));

  const ui = await init({}, { root });

  assert.ok(!('inspector' in ui.modules));
  assert.equal(Object.keys(ui.modules).length, 4);
  assert.equal(console.warn.mock.callCount(), 1);
  assert.match(console.warn.mock.calls[0].arguments[0], /#inspector/);
});

test('init ne plante pas sans document ni app (chargement sous Node, pôles en échec)', async (t) => {
  t.mock.method(console, 'warn', () => {});
  const ui = await init(undefined, { root: undefined });
  assert.deepEqual(ui.modules, {});
  assert.equal(ui.mountPoints, MOUNT_POINTS);
});

test('l\'API du pôle ui (app.ui) expose la sélection pour les autres pôles', async () => {
  const ui = await init({}, { root: fakeRoot(Object.values(MOUNT_POINTS)) });
  for (const name of ['select', 'clear', 'getSelection', 'onChange']) {
    assert.equal(typeof ui[name], 'function', `app.ui.${name} manquant`);
  }
});

test('index.html déclare chaque point de montage une seule fois', async () => {
  const html = await read('index.html');
  for (const id of Object.values(MOUNT_POINTS)) {
    const count = html.match(new RegExp(`id="${id}"`, 'g'))?.length ?? 0;
    assert.equal(count, 1, `id="${id}" trouvé ${count} fois dans index.html`);
  }
});

test('index.html charge main.js, le manifest et les styles par des chemins relatifs', async () => {
  const html = await read('index.html');
  assert.match(html, /<script type="module" src="main\.js"><\/script>/);
  assert.match(html, /<link rel="manifest" href="manifest\.json">/);
  assert.match(html, /<link rel="stylesheet" href="styles\.css">/);
});

test('aucune ressource externe dans l\'interface : le hors ligne doit rester possible', async () => {
  const files = ['index.html', 'styles.css', 'src/ui/index.js', 'src/ui/controls.js',
    'src/ui/inspector.js', 'src/ui/explanations.js', 'src/ui/scenarioPicker.js',
    'src/ui/selection.js', 'src/ui/keyboard.js', 'src/ui/install.js'];
  for (const path of files) {
    assert.doesNotMatch(await read(path), /(https?:)?\/\/[a-z0-9-]+\.[a-z]/i, path);
  }
});
