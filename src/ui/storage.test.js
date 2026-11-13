// Tests de l'enregistrement des topologies (phase 7c) : stockage injecté, sans navigateur.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

import { addDevice, newTopology } from '../../simulation.js';
import { createTopologyStore, DRAFT_KEY, exportJson, fileName, LIBRARY_KEY, MAX_IMPORT, parseImport, UNAVAILABLE } from './storage.js';

/** Faux localStorage en mémoire. */
export function memoryStorage() {
  const data = new Map();
  return {
    getItem: (key) => (data.has(key) ? data.get(key) : null),
    setItem: (key, value) => data.set(key, String(value)),
    removeItem: (key) => data.delete(key),
    data,
  };
}

/** Stockage qui refuse tout (navigation privée, quota dépassé). */
const brokenStorage = { getItem() { throw new Error('bloqué'); }, setItem() { throw new Error('plein'); }, removeItem() { throw new Error('bloqué'); } };

const sample = () => addDevice(newTopology({ title: 'Salle 12' }), { model: 'pc-1g' }).scenario;

test('nom de fichier : sans accents, espaces ni caractères spéciaux', () => {
  assert.equal(fileName('Réseau de l\'école'), 'topologie-reseau-de-l-ecole.json');
  assert.equal(fileName(''), 'topologie-sans-nom.json');
  assert.equal(fileName('***'), 'topologie-sans-nom.json');
});

test('export puis import : même topologie ; scénario fourni importé comme copie modifiable', async () => {
  const scenario = sample();
  const parsed = parseImport(exportJson(scenario));
  assert.equal(parsed.ok, true);
  assert.deepEqual(parsed.scenario, scenario);
  const ping = await readFile(new URL('../../scenarios/ping.json', import.meta.url), 'utf8');
  const imported = parseImport(ping);
  assert.equal(imported.ok, true);
  assert.equal(imported.scenario.protocol, 'aucun');
  assert.equal(imported.scenario.devices.length, 5);
});

test('import refusé avec des messages clairs', () => {
  assert.deepEqual(parseImport('').errors, ['Le fichier est vide.']);
  assert.deepEqual(parseImport('{ pas du json').errors, ['Ce fichier n\'est pas du JSON valide.']);
  assert.match(parseImport('x'.repeat(MAX_IMPORT + 1)).errors[0], /1 Mo/);
  const invalid = parseImport(JSON.stringify({ schema: 1, id: 'x' }));
  assert.equal(invalid.ok, false);
  assert.equal(invalid.errors[0], 'Ce fichier n\'est pas une topologie valide :');
  assert.ok(invalid.errors.length > 1 && invalid.errors.length <= 7);
});

test('brouillon : gardé, retrouvé, effacé ; contenu abîmé ignoré', () => {
  const storage = memoryStorage();
  const store = createTopologyStore(storage);
  assert.equal(store.loadDraft(), null);
  assert.equal(store.saveDraft(sample()).ok, true);
  assert.equal(store.loadDraft().title, 'Salle 12');
  storage.setItem(DRAFT_KEY, '{abîmé');
  assert.equal(store.loadDraft(), null);
  store.clearDraft();
  assert.equal(storage.getItem(DRAFT_KEY), null);
});

test('topologies nommées : enregistrer, remplacer, lister (récentes d\'abord), ouvrir, supprimer', () => {
  const storage = memoryStorage();
  let clock = 0;
  const store = createTopologyStore(storage, () => new Date(Date.UTC(2026, 10, 13, 10, clock++)));
  assert.deepEqual(store.list(), { ok: true, items: [] });
  assert.deepEqual(store.save('Salle 12', sample()), { ok: true, replaced: false });
  assert.deepEqual(store.save('Labo', sample()), { ok: true, replaced: false });
  assert.deepEqual(store.save('Salle 12', sample()), { ok: true, replaced: true });
  assert.deepEqual(store.list().items.map((item) => [item.name, item.devices]), [['Salle 12', 1], ['Labo', 1]]);
  assert.equal(store.open('Labo').scenario.title, 'Labo', 'le nom devient le titre');
  assert.match(store.open('Absent').error, /Aucune topologie « Absent »/);
  assert.match(store.save('  ', sample()).error, /Donnez un nom/);
  assert.match(store.save('x'.repeat(41), sample()).error, /40 caractères/);
  store.remove('Labo');
  assert.deepEqual(store.list().items.map((item) => item.name), ['Salle 12']);
  storage.setItem(LIBRARY_KEY, 'abîmé');
  assert.deepEqual(store.list().items, [], 'liste abîmée : on repart de zéro sans erreur');
});

test('stockage indisponible : message clair, jamais d\'exception', () => {
  for (const storage of [brokenStorage, { getItem: undefined }]) {
    const store = createTopologyStore(storage);
    assert.equal(store.loadDraft(), null);
    assert.deepEqual(store.saveDraft(sample()), { ok: false, error: UNAVAILABLE });
    assert.deepEqual(store.list(), { ok: false, error: UNAVAILABLE });
    assert.deepEqual(store.save('A', sample()), { ok: false, error: UNAVAILABLE });
  }
});
